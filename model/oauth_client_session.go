package model

import (
	"time"

	"gorm.io/gorm"
)

type OAuthClientSession struct {
	SessionID     string `json:"session_id" gorm:"column:session_id;type:varchar(64);primaryKey"`
	UserID        int    `json:"user_id" gorm:"column:user_id;not null;index:idx_oauth_client_user_client_created,priority:1"`
	ClientID      string `json:"client_id" gorm:"column:client_id;type:varchar(64);not null;index:idx_oauth_client_user_client_created,priority:2"`
	Scopes        string `json:"scopes" gorm:"column:scopes;type:varchar(128);not null"`
	DeviceID      string `json:"device_id,omitempty" gorm:"column:device_id;type:varchar(64)"`
	DeviceName    string `json:"device_name,omitempty" gorm:"column:device_name;type:varchar(255)"`
	Platform      string `json:"platform,omitempty" gorm:"column:platform;type:varchar(16)"`
	ClientVersion string `json:"client_version,omitempty" gorm:"column:client_version;type:varchar(64)"`
	CreatedAt     int64  `json:"created_at" gorm:"column:created_at;type:bigint;not null;index:idx_oauth_client_user_client_created,priority:3"`
}

func (OAuthClientSession) TableName() string {
	return "oauth_client_sessions"
}

type OAuthClientSessionRecord struct {
	OAuth   OAuthClientSession
	Session UserSession
}

// LockOAuthClientUserWithTx serializes issuance across distinct authorization
// codes for one user. Call before any snapshot reads of the session budgets.
// SQLite already holds its writer lock after the AuthFlow consumption update.
func LockOAuthClientUserWithTx(tx *gorm.DB, userID int) (*User, error) {
	if tx == nil || userID <= 0 {
		return nil, ErrUserSessionInvalid
	}
	var user User
	if err := lockForUpdate(tx).Where("id = ?", userID).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func CreateOAuthClientSessionWithTx(tx *gorm.DB, session *OAuthClientSession) error {
	if tx == nil || session == nil || session.SessionID == "" || session.UserID <= 0 || session.ClientID == "" || session.Scopes == "" {
		return ErrUserSessionInvalid
	}
	if session.CreatedAt <= 0 {
		session.CreatedAt = time.Now().Unix()
	}
	return tx.Create(session).Error
}

func GetOAuthClientSession(sessionID string) (*OAuthClientSession, error) {
	if sessionID == "" {
		return nil, ErrUserSessionInvalid
	}
	var session OAuthClientSession
	if err := DB.Where("session_id = ?", sessionID).First(&session).Error; err != nil {
		return nil, err
	}
	return &session, nil
}

func GetOAuthClientSessionForUser(sessionID string, userID int, clientID string) (*OAuthClientSession, error) {
	if sessionID == "" || userID <= 0 || clientID == "" {
		return nil, ErrUserSessionInvalid
	}
	var session OAuthClientSession
	if err := DB.Where("session_id = ? AND user_id = ? AND client_id = ?", sessionID, userID, clientID).First(&session).Error; err != nil {
		return nil, err
	}
	return &session, nil
}

func CountActiveOAuthClientSessions(userID int, clientID string, now int64) (int64, error) {
	return CountActiveOAuthClientSessionsWithTx(DB, userID, clientID, now)
}

func CountActiveOAuthClientSessionsWithTx(tx *gorm.DB, userID int, clientID string, now int64) (int64, error) {
	if tx == nil || userID <= 0 || clientID == "" {
		return 0, ErrUserSessionInvalid
	}
	if now <= 0 {
		now = time.Now().Unix()
	}
	var count int64
	err := tx.Model(&OAuthClientSession{}).
		Joins("JOIN user_sessions ON user_sessions.sid = oauth_client_sessions.session_id").
		Where("oauth_client_sessions.user_id = ? AND oauth_client_sessions.client_id = ?", userID, clientID).
		Where("user_sessions.user_id = ? AND user_sessions.login_method = ?", userID, UserSessionLoginMethodOAuthClient).
		Where("user_sessions.status = ? AND user_sessions.revoked_at = ? AND user_sessions.expires_at > ?", UserSessionStatusActive, 0, now).
		Count(&count).Error
	return count, err
}

func CountOAuthClientSessionsCreatedSince(userID int, clientID string, createdAfter int64) (int64, error) {
	return CountOAuthClientSessionsCreatedSinceWithTx(DB, userID, clientID, createdAfter)
}

func CountOAuthClientSessionsCreatedSinceWithTx(tx *gorm.DB, userID int, clientID string, createdAfter int64) (int64, error) {
	if tx == nil || userID <= 0 || clientID == "" || createdAfter <= 0 {
		return 0, ErrUserSessionInvalid
	}
	var count int64
	err := tx.Model(&OAuthClientSession{}).
		Where("user_id = ? AND client_id = ? AND created_at > ?", userID, clientID, createdAfter).
		Count(&count).Error
	return count, err
}

func ListOAuthClientSessions(userID int, clientID, cursor string, limit int, now int64) ([]OAuthClientSessionRecord, error) {
	if userID <= 0 || clientID == "" || limit <= 0 || limit > 101 {
		return nil, ErrUserSessionInvalid
	}
	if now <= 0 {
		now = time.Now().Unix()
	}
	var userAuthVersion int64
	if err := DB.Model(&User{}).Where("id = ?", userID).Select("auth_version").Scan(&userAuthVersion).Error; err != nil {
		return nil, err
	}
	if userAuthVersion <= 0 {
		return nil, ErrUserSessionInvalid
	}

	query := DB.Model(&OAuthClientSession{}).
		Select("oauth_client_sessions.*").
		Joins("JOIN user_sessions ON user_sessions.sid = oauth_client_sessions.session_id").
		Where("oauth_client_sessions.user_id = ? AND oauth_client_sessions.client_id = ?", userID, clientID).
		Where("user_sessions.user_id = ? AND user_sessions.login_method = ?", userID, UserSessionLoginMethodOAuthClient).
		Where("user_sessions.user_auth_version = ? AND user_sessions.status = ? AND user_sessions.revoked_at = ? AND user_sessions.expires_at > ?", userAuthVersion, UserSessionStatusActive, 0, now)
	if cursor != "" {
		var anchor OAuthClientSession
		if err := query.Where("oauth_client_sessions.session_id = ?", cursor).First(&anchor).Error; err != nil {
			return nil, err
		}
		query = DB.Model(&OAuthClientSession{}).
			Select("oauth_client_sessions.*").
			Joins("JOIN user_sessions ON user_sessions.sid = oauth_client_sessions.session_id").
			Where("oauth_client_sessions.user_id = ? AND oauth_client_sessions.client_id = ?", userID, clientID).
			Where("user_sessions.user_id = ? AND user_sessions.login_method = ?", userID, UserSessionLoginMethodOAuthClient).
			Where("user_sessions.user_auth_version = ? AND user_sessions.status = ? AND user_sessions.revoked_at = ? AND user_sessions.expires_at > ?", userAuthVersion, UserSessionStatusActive, 0, now).
			Where("oauth_client_sessions.created_at < ? OR (oauth_client_sessions.created_at = ? AND oauth_client_sessions.session_id < ?)", anchor.CreatedAt, anchor.CreatedAt, anchor.SessionID)
	}

	var oauthSessions []OAuthClientSession
	if err := query.Order("oauth_client_sessions.created_at DESC").Order("oauth_client_sessions.session_id DESC").Limit(limit).Find(&oauthSessions).Error; err != nil {
		return nil, err
	}
	if len(oauthSessions) == 0 {
		return []OAuthClientSessionRecord{}, nil
	}

	sids := make([]string, 0, len(oauthSessions))
	for i := range oauthSessions {
		sids = append(sids, oauthSessions[i].SessionID)
	}
	var userSessions []UserSession
	if err := DB.Where("sid IN ?", sids).Find(&userSessions).Error; err != nil {
		return nil, err
	}
	bySID := make(map[string]UserSession, len(userSessions))
	for i := range userSessions {
		bySID[userSessions[i].SID] = userSessions[i]
	}
	records := make([]OAuthClientSessionRecord, 0, len(oauthSessions))
	for i := range oauthSessions {
		userSession, found := bySID[oauthSessions[i].SessionID]
		if !found {
			continue
		}
		records = append(records, OAuthClientSessionRecord{OAuth: oauthSessions[i], Session: userSession})
	}
	return records, nil
}

func DeleteOrphanedOAuthClientSessions() error {
	return DB.Where("NOT EXISTS (?)", DB.Table("user_sessions").Select("1").Where("user_sessions.sid = oauth_client_sessions.session_id")).
		Delete(&OAuthClientSession{}).Error
}

func DeleteOAuthClientSessionsByUserWithTx(tx *gorm.DB, userID int) error {
	if tx == nil || userID <= 0 {
		return ErrUserSessionInvalid
	}
	return tx.Where("user_id = ?", userID).Delete(&OAuthClientSession{}).Error
}
