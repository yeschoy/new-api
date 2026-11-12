package router

import (
	"embed"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
)

// WebAssets holds the embedded dashboard frontend assets.
type WebAssets struct {
	BuildFS   embed.FS
	IndexPage []byte
}

func SetWebRouter(router *gin.Engine, assets WebAssets, pluginDispatcher gin.HandlerFunc) {
	frontendFS := common.EmbedFolder(assets.BuildFS, "web/dist")
	router.GET("/oauth/handoff", middleware.RouteTag("web"), controller.DomainOAuthHandoffBridge)
	router.GET("/partner-authorize", middleware.RouteTag("web"), controller.ServePartnerAuthorizePage(assets.IndexPage))
	// Purchase and cashier capabilities live in fragments. Both HTML surfaces
	// avoid caches/referrers and remain standalone (never iframe-embeddable).
	partnerPublicHTML := func(canonical string) gin.HandlerFunc {
		return func(c *gin.Context) {
			c.Header("Referrer-Policy", "no-referrer")
			c.Header("X-Frame-Options", "DENY")
			c.Header("Content-Security-Policy", "frame-ancestors 'none'")
			// Gin routes on decoded URL.Path; canonicalize only these exact,
			// once-decoded paths, not double-encoded or lookalike aliases.
			if c.Request.URL.EscapedPath() != canonical {
				destination := canonical
				if c.Request.URL.RawQuery != "" {
					destination += "?" + c.Request.URL.RawQuery
				}
				c.Redirect(http.StatusMovedPermanently, destination)
				return
			}
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.IndexPage)
		}
	}
	for _, path := range []string{"/partner/checkout", "/partner/purchase"} {
		handler := partnerPublicHTML(path)
		router.GET(path, middleware.RouteTag("web"), middleware.DisableCache(), handler)
		router.GET(path+"/", middleware.RouteTag("web"), middleware.DisableCache(), handler)
	}
	compress := gzip.Gzip(gzip.DefaultCompression)
	router.GET("/desktop/connect", middleware.RouteTag("web"), middleware.DisableCache(), func(c *gin.Context) {
		controller.ServeDesktopConnectSPA(c, assets.IndexPage)
	})

	router.NoRoute(
		pluginDispatcher,
		middleware.RouteTag("web"),
		func(c *gin.Context) {
			// ServeFrontendFiles sends build files already compressed.
			if !frontendFS.Exists("/", c.Request.URL.Path) {
				compress(c)
			}
		},
		middleware.AccessTokenAudit(),
		middleware.GlobalWebRateLimit(frontendFS),
		middleware.Cache(),
		middleware.ServeFrontendFiles(frontendFS),
		func(c *gin.Context) {
			if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") || strings.HasPrefix(c.Request.RequestURI, "/assets") {
				controller.RelayNotFound(c)
				return
			}
			c.Header("Cache-Control", "no-cache")
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.IndexPage)
		},
	)
}
