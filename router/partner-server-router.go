package router

import (
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
)

// SetPartnerServerRouter registers the partner server API. It must run before
// any engine-wide CORS middleware is added, so these routes never answer
// cross-origin requests from browsers.
func SetPartnerServerRouter(router *gin.Engine) {
	partner := router.Group("/api/partner/v1")
	partner.Use(middleware.RouteTag("api"), middleware.PartnerOAuthRequestID(), middleware.PartnerOAuthNoStore(), middleware.PartnerOAuthRateLimit("PSV-IP", 1200, 60, "integration"))
	partner.OPTIONS("/*path", middleware.PartnerServerRejectPreflight)
}
