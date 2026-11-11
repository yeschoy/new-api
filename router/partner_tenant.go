package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
)

func SetPartnerTenantRouter(router *gin.Engine) {
	partner := router.Group("/api/partner/v1")
	partner.Use(
		middleware.RouteTag("api"),
		middleware.PartnerOAuthRequestID(),
		middleware.PartnerOAuthNoStore(),
		middleware.PartnerOAuthRateLimit("PT-INT", 3000, 60, "integration"),
		middleware.PartnerTenantBearer(),
	)
	{
		partner.GET("/plans", controller.PartnerTenantListPlans)
		partner.PUT("/accounts", controller.PartnerTenantProvisionAccount)
		partner.POST("/subscription-orders", controller.PartnerTenantCreateSubscriptionOrder)
		partner.GET("/subscription-orders/:order_no", controller.PartnerTenantGetSubscriptionOrder)
		partner.GET("/accounts/:external_user_id/subscription/quota", controller.PartnerTenantSubscriptionQuota)
	}
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
