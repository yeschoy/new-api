package middleware

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

const RouteTagKey = "route_tag"

func RouteTag(tag string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(RouteTagKey, tag)
		c.Next()
	}
}

func SetUpLogger(server *gin.Engine) {
	server.Use(redactTaskArtifactAccessQuery())
	server.Use(gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
		var requestID string
		if param.Keys != nil {
			requestID, _ = param.Keys[common.RequestIdKey].(string)
		}
		tag, _ := param.Keys[RouteTagKey].(string)
		if tag == "" {
			tag = "web"
		}
		return fmt.Sprintf("[GIN] %s | %s | %s | %3d | %13v | %15s | %7s %s\n",
			param.TimeStamp.Format("2006/01/02 - 15:04:05"),
			tag,
			requestID,
			param.StatusCode,
			param.Latency,
			param.ClientIP,
			param.Method,
			redactSensitiveLogPath(param.Path),
		)
	}))
}

func redactSensitiveLogPath(rawPath string) string {
	parsed, err := url.ParseRequestURI(rawPath)
	if err != nil {
		if queryIndex := strings.IndexByte(rawPath, '?'); queryIndex >= 0 {
			return rawPath[:queryIndex] + "?[REDACTED]"
		}
		return rawPath
	}
	path := strings.TrimRight(parsed.Path, "/")
	var sensitiveKeys []string
	switch {
	case path == "/api/stripe/return", path == "/api/user/epay/return", path == "/api/reset_password/return", path == "/user/reset":
		sensitiveKeys = []string{"trade_no", "out_trade_no", "sign", "email", "token", "context"}
	case path == "/api/oauth", strings.HasPrefix(path, "/api/oauth/"), path == "/oauth/authorize":
		sensitiveKeys = []string{"redirect_uri", "state", "code_challenge", "request", "code", "code_verifier", "access_token", "refresh_token", "token"}
	case path == "/sign-in":
		sensitiveKeys = []string{"redirect"}
	default:
		return rawPath
	}
	query := parsed.Query()
	for _, key := range sensitiveKeys {
		if query.Has(key) {
			query.Set(key, "[REDACTED]")
		}
	}
	parsed.RawQuery = query.Encode()
	return parsed.RequestURI()
}
