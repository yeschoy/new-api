package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func SetPartnerTenantRouter(router *gin.Engine) {
	partner := router.Group("/api/partner/v1")
	partner.Use(
		middleware.RouteTag("api"),
		middleware.PartnerOAuthRequestID(),
		middleware.PartnerOAuthNoStore(),
		middleware.PartnerTenantAuthorizationAudit(),
		controller.PartnerTenantSubscriptionKeyRequestPolicy(),
		middleware.PartnerOAuthRateLimit("PT-INT", 3000, 60, "integration"),
		middleware.PartnerTenantBearer(),
	)
	{
		partner.POST("/subscription-key-orders", middleware.PartnerTenantAdmission(model.PartnerTenantOperationSubscriptionKey), controller.PartnerTenantCreateSubscriptionKeyOrder)
		partner.GET("/subscription-key-orders/:order_no", middleware.PartnerTenantAdmission(model.PartnerTenantOperationSubscriptionKey), controller.PartnerTenantGetSubscriptionKeyOrder)
		partner.GET("/subscription-key-orders/:order_no/subscription-key", middleware.PartnerTenantAdmission(model.PartnerTenantOperationSubscriptionKey), controller.PartnerTenantClaimSubscriptionKey)
		partner.POST("/subscriptions/:subscription_id/key/rotate", middleware.PartnerTenantAdmission(model.PartnerTenantOperationSubscriptionKey), controller.PartnerTenantRotateSubscriptionKey)
		partner.GET("/plans", middleware.PartnerTenantAdmission(model.PartnerTenantOperationCatalog), controller.PartnerTenantListPlans)
		partner.POST("/purchase-sessions", middleware.PartnerTenantAdmission(model.PartnerTenantOperationHostedH5), controller.PartnerTenantCreatePurchaseSession)
		partner.GET("/purchase-sessions/:session_id", middleware.PartnerTenantAdmission(model.PartnerTenantOperationHostedH5), controller.PartnerTenantGetPurchaseSession)
		partner.PUT("/accounts", middleware.PartnerTenantAdmission(model.PartnerTenantOperationHostedH5), controller.PartnerTenantProvisionAccount)
		partner.POST("/subscription-orders", middleware.PartnerTenantAdmission(model.PartnerTenantOperationDirectOrder), controller.PartnerTenantCreateSubscriptionOrder)
		partner.GET("/subscription-orders/:order_no", middleware.PartnerTenantAdmission(model.PartnerTenantOperationHostedH5), controller.PartnerTenantGetSubscriptionOrder)
		partner.GET("/accounts/:external_user_id/subscription/quota", middleware.PartnerTenantAdmission(model.PartnerTenantOperationHostedH5), controller.PartnerTenantSubscriptionQuota)
	}
	independent := router.Group("/api/partner/subscription")
	independent.Use(middleware.RouteTag("api"), middleware.PartnerOAuthRequestID(), middleware.PartnerOAuthNoStore(), middleware.PartnerTenantAuthorizationAudit(), controller.PartnerTenantSubscriptionKeyRequestPolicy(), middleware.PartnerOAuthRateLimit("PT-SUBSCRIPTION", 120, 60, "integration"))
	independent.GET("", controller.PartnerTenantIndependentSubscription)
	purchase := router.Group("/api/partner/purchase-sessions")
	purchase.Use(middleware.RouteTag("api"), middleware.PartnerOAuthRequestID(), middleware.PartnerOAuthNoStore(), middleware.PartnerTenantAuthorizationAudit(), controller.PartnerTenantSubscriptionKeyRequestPolicy(), func(c *gin.Context) {
		c.Header("Referrer-Policy", "no-referrer")
		c.Next()
	}, middleware.PartnerOAuthRateLimit("PT-PURCHASE", 120, 60, "integration"))
	purchase.POST("/:session_id/exchange", controller.PartnerTenantExchangePurchaseSession)
	purchase.GET("/:session_id", controller.PartnerTenantPublicPurchaseSession)
	purchase.POST("/:session_id/orders", controller.PartnerTenantPurchaseSessionCreateOrder)
	cashier := router.Group("/api/partner/checkout")
	cashier.Use(middleware.RouteTag("api"), middleware.PartnerOAuthRequestID(), middleware.PartnerOAuthNoStore(), middleware.PartnerOAuthRateLimit("PT-CASHIER", 120, 60, "integration"))
	cashier.GET("/:order_no", controller.PartnerTenantCashier)
	payment := router.Group("/api/partner/subscription/epay")
	payment.Use(middleware.RouteTag("api"), middleware.PartnerOAuthNoStore())
	payment.GET("/notify", controller.PartnerTenantEpayNotify)
	payment.POST("/notify", controller.PartnerTenantEpayNotify)
	payment.GET("/return", controller.PartnerTenantEpayReturn)
	payment.POST("/return", controller.PartnerTenantEpayReturn)
}
