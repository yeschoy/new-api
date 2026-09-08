package i18n

import "github.com/nicksnyder/go-i18n/v2/i18n"

// OAuthAuthorizationError localizes the standalone browser error page. It uses
// the browser's full language preferences, including frontend-only languages,
// without changing language negotiation for existing API responses.
func OAuthAuthorizationError(acceptLanguage, code string) (title, description, lang string) {
	switch code {
	case "invalid_request", "invalid_client", "unsupported_response_type", "invalid_scope":
	default:
		code = "server_error"
	}
	localizer := i18n.NewLocalizer(bundle, acceptLanguage, DefaultLang)
	title, tag, _ := localizer.LocalizeWithTag(&i18n.LocalizeConfig{
		MessageID: "oauth_client.authorization_error_title",
	})
	description, _ = localizer.Localize(&i18n.LocalizeConfig{
		MessageID: "oauth_client." + code,
	})
	return title, description, tag.String()
}
