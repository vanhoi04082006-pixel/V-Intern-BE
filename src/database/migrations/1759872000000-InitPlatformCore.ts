import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PHASE 1 — PLATFORM CORE (spec scope: identity/RBAC, tokens, catalogs,
 * settings, audit, activity, notifications + preferences).
 *
 * EMPTY SQL Server 2019 database → up = complete core schema.
 * Down = drops everything in reverse FK order (rollback path).
 *
 * Conventions:
 * - PKs: uniqueidentifier (client-generated uuid; DB default NEWID as safety)
 * - Strings: nvarchar (explicit lengths), large text: nvarchar(max)
 * - Timestamps: datetime2 (UTC), defaults SYSUTCDATETIME()
 * - All constraints and indexes explicitly named (reviewable, drop-safe)
 */
export class InitPlatformCore1759872000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const S = queryRunner.query.bind(queryRunner);

    // ── Identity ──────────────────────────────────────────────────────────
    await S(`
      CREATE TABLE users (
        id uniqueidentifier NOT NULL CONSTRAINT DF_users_id DEFAULT NEWID()
          CONSTRAINT PK_users PRIMARY KEY,
        email nvarchar(320) NOT NULL,
        username nvarchar(64) NOT NULL,
        displayName nvarchar(128) NOT NULL,
        passwordHash nvarchar(255) NOT NULL,
        status nvarchar(16) NOT NULL CONSTRAINT DF_users_status DEFAULT ('pending')
          CONSTRAINT CK_users_status CHECK ([status] IN ('active','pending','locked','deleted')),
        lastLoginAt datetime2 NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_users_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_users_updatedAt DEFAULT SYSUTCDATETIME()
      );`);
    await S(`CREATE UNIQUE INDEX UX_users_email ON users (email);`);
    await S(`CREATE UNIQUE INDEX UX_users_username ON users (username);`);

    await S(`
      CREATE TABLE roles (
        id uniqueidentifier NOT NULL CONSTRAINT DF_roles_id DEFAULT NEWID()
          CONSTRAINT PK_roles PRIMARY KEY,
        code nvarchar(64) NOT NULL,
        name nvarchar(128) NOT NULL,
        description nvarchar(512) NULL,
        isSystem bit NOT NULL CONSTRAINT DF_roles_isSystem DEFAULT (0),
        createdAt datetime2 NOT NULL CONSTRAINT DF_roles_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_roles_updatedAt DEFAULT SYSUTCDATETIME()
      );`);
    await S(`CREATE UNIQUE INDEX UX_roles_code ON roles (code);`);

    await S(`
      CREATE TABLE permissions (
        id uniqueidentifier NOT NULL CONSTRAINT DF_permissions_id DEFAULT NEWID()
          CONSTRAINT PK_permissions PRIMARY KEY,
        code nvarchar(128) NOT NULL,
        name nvarchar(128) NOT NULL,
        description nvarchar(512) NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_permissions_createdAt DEFAULT SYSUTCDATETIME()
      );`);
    await S(`CREATE UNIQUE INDEX UX_permissions_code ON permissions (code);`);

    await S(`
      CREATE TABLE user_roles (
        userId uniqueidentifier NOT NULL,
        roleId uniqueidentifier NOT NULL,
        grantedAt datetime2 NOT NULL CONSTRAINT DF_user_roles_grantedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_user_roles PRIMARY KEY (userId, roleId),
        CONSTRAINT FK_user_roles_user FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT FK_user_roles_role FOREIGN KEY (roleId) REFERENCES roles (id) ON DELETE CASCADE
      );`);
    await S(`CREATE INDEX IX_user_roles_roleId ON user_roles (roleId);`);

    await S(`
      CREATE TABLE role_permissions (
        roleId uniqueidentifier NOT NULL,
        permissionId uniqueidentifier NOT NULL,
        grantedAt datetime2 NOT NULL CONSTRAINT DF_role_permissions_grantedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_role_permissions PRIMARY KEY (roleId, permissionId),
        CONSTRAINT FK_role_permissions_role FOREIGN KEY (roleId) REFERENCES roles (id) ON DELETE CASCADE,
        CONSTRAINT FK_role_permissions_permission FOREIGN KEY (permissionId) REFERENCES permissions (id) ON DELETE CASCADE
      );`);
    await S(`CREATE INDEX IX_role_permissions_permissionId ON role_permissions (permissionId);`);

    // ── Groups (role inheritance via groups) ─────────────────────────────
    await S(`
      CREATE TABLE user_groups (
        id uniqueidentifier NOT NULL CONSTRAINT DF_user_groups_id DEFAULT NEWID()
          CONSTRAINT PK_user_groups PRIMARY KEY,
        code nvarchar(64) NOT NULL,
        name nvarchar(128) NOT NULL,
        description nvarchar(512) NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_user_groups_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_user_groups_updatedAt DEFAULT SYSUTCDATETIME()
      );`);
    await S(`CREATE UNIQUE INDEX UX_user_groups_code ON user_groups (code);`);

    await S(`
      CREATE TABLE group_members (
        groupId uniqueidentifier NOT NULL,
        userId uniqueidentifier NOT NULL,
        joinedAt datetime2 NOT NULL CONSTRAINT DF_group_members_joinedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_group_members PRIMARY KEY (groupId, userId),
        CONSTRAINT FK_group_members_group FOREIGN KEY (groupId) REFERENCES user_groups (id) ON DELETE CASCADE,
        CONSTRAINT FK_group_members_user FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
      );`);
    await S(`CREATE INDEX IX_group_members_userId ON group_members (userId);`);

    await S(`
      CREATE TABLE group_roles (
        groupId uniqueidentifier NOT NULL,
        roleId uniqueidentifier NOT NULL,
        grantedAt datetime2 NOT NULL CONSTRAINT DF_group_roles_grantedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_group_roles PRIMARY KEY (groupId, roleId),
        CONSTRAINT FK_group_roles_group FOREIGN KEY (groupId) REFERENCES user_groups (id) ON DELETE CASCADE,
        CONSTRAINT FK_group_roles_role FOREIGN KEY (roleId) REFERENCES roles (id) ON DELETE CASCADE
      );`);
    await S(`CREATE INDEX IX_group_roles_roleId ON group_roles (roleId);`);

    // ── Refresh tokens (hashed at rest, rotation + family reuse detection) ─
    await S(`
      CREATE TABLE refresh_tokens (
        id uniqueidentifier NOT NULL CONSTRAINT DF_refresh_tokens_id DEFAULT NEWID()
          CONSTRAINT PK_refresh_tokens PRIMARY KEY,
        userId uniqueidentifier NOT NULL,
        tokenHash nvarchar(64) NOT NULL,
        familyId uniqueidentifier NOT NULL,
        replacedById uniqueidentifier NULL,
        expiresAt datetime2 NOT NULL,
        revokedAt datetime2 NULL,
        createdByIp nvarchar(64) NULL,
        userAgent nvarchar(256) NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_refresh_tokens_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_refresh_tokens_user FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
      );`);
    await S(`CREATE UNIQUE INDEX UX_refresh_tokens_tokenHash ON refresh_tokens (tokenHash);`);
    await S(`CREATE INDEX IX_refresh_tokens_userId ON refresh_tokens (userId);`);
    await S(`CREATE INDEX IX_refresh_tokens_familyId ON refresh_tokens (familyId);`);

    // ── Catalogs ──────────────────────────────────────────────────────────
    await S(`
      CREATE TABLE catalog_types (
        id uniqueidentifier NOT NULL CONSTRAINT DF_catalog_types_id DEFAULT NEWID()
          CONSTRAINT PK_catalog_types PRIMARY KEY,
        code nvarchar(64) NOT NULL,
        name nvarchar(128) NOT NULL,
        description nvarchar(512) NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_catalog_types_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_catalog_types_updatedAt DEFAULT SYSUTCDATETIME()
      );`);
    await S(`CREATE UNIQUE INDEX UX_catalog_types_code ON catalog_types (code);`);

    await S(`
      CREATE TABLE catalog_items (
        id uniqueidentifier NOT NULL CONSTRAINT DF_catalog_items_id DEFAULT NEWID()
          CONSTRAINT PK_catalog_items PRIMARY KEY,
        typeId uniqueidentifier NOT NULL,
        code nvarchar(64) NOT NULL,
        name nvarchar(128) NOT NULL,
        value nvarchar(1024) NULL,
        sortOrder int NOT NULL CONSTRAINT DF_catalog_items_sortOrder DEFAULT (0),
        isActive bit NOT NULL CONSTRAINT DF_catalog_items_isActive DEFAULT (1),
        createdAt datetime2 NOT NULL CONSTRAINT DF_catalog_items_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_catalog_items_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_catalog_items_type FOREIGN KEY (typeId) REFERENCES catalog_types (id) ON DELETE CASCADE
      );`);
    await S(`CREATE UNIQUE INDEX UX_catalog_items_type_code ON catalog_items (typeId, code);`);

    // ── System settings ───────────────────────────────────────────────────
    await S(`
      CREATE TABLE system_settings (
        settingKey nvarchar(128) NOT NULL CONSTRAINT PK_system_settings PRIMARY KEY,
        value nvarchar(max) NOT NULL,
        description nvarchar(512) NULL,
        updatedAt datetime2 NOT NULL CONSTRAINT DF_system_settings_updatedAt DEFAULT SYSUTCDATETIME()
      );`);

    // ── Audit (compliance) + Activity (user feed) — distinct tables ───────
    await S(`
      CREATE TABLE audit_logs (
        id uniqueidentifier NOT NULL CONSTRAINT DF_audit_logs_id DEFAULT NEWID()
          CONSTRAINT PK_audit_logs PRIMARY KEY,
        actorId uniqueidentifier NULL,
        action nvarchar(128) NOT NULL,
        targetType nvarchar(64) NULL,
        targetId nvarchar(64) NULL,
        detail nvarchar(max) NULL,
        ip nvarchar(64) NULL,
        userAgent nvarchar(256) NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_audit_logs_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_audit_logs_actor FOREIGN KEY (actorId) REFERENCES users (id) ON DELETE SET NULL
      );`);
    await S(`CREATE INDEX IX_audit_logs_actor_createdAt ON audit_logs (actorId, createdAt DESC);`);
    await S(`CREATE INDEX IX_audit_logs_action_createdAt ON audit_logs (action, createdAt DESC);`);

    await S(`
      CREATE TABLE activity_events (
        id uniqueidentifier NOT NULL CONSTRAINT DF_activity_events_id DEFAULT NEWID()
          CONSTRAINT PK_activity_events PRIMARY KEY,
        actorId uniqueidentifier NULL,
        module nvarchar(64) NOT NULL,
        action nvarchar(128) NOT NULL,
        targetType nvarchar(64) NULL,
        targetId nvarchar(64) NULL,
        summary nvarchar(512) NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_activity_events_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_activity_events_actor FOREIGN KEY (actorId) REFERENCES users (id) ON DELETE SET NULL
      );`);
    await S(`CREATE INDEX IX_activity_events_createdAt ON activity_events (createdAt DESC);`);
    await S(`CREATE INDEX IX_activity_events_module_createdAt ON activity_events (module, createdAt DESC);`);

    // ── Notifications + preferences ───────────────────────────────────────
    await S(`
      CREATE TABLE notifications (
        id uniqueidentifier NOT NULL CONSTRAINT DF_notifications_id DEFAULT NEWID()
          CONSTRAINT PK_notifications PRIMARY KEY,
        userId uniqueidentifier NOT NULL,
        type nvarchar(64) NOT NULL,
        title nvarchar(256) NOT NULL,
        body nvarchar(max) NULL,
        linkUrl nvarchar(512) NULL,
        readAt datetime2 NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_notifications_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_notifications_user FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
      );`);
    await S(`CREATE INDEX IX_notifications_userId_readAt ON notifications (userId, readAt);`);

    await S(`
      CREATE TABLE notification_preferences (
        userId uniqueidentifier NOT NULL,
        category nvarchar(64) NOT NULL,
        enabled bit NOT NULL CONSTRAINT DF_notification_preferences_enabled DEFAULT (1),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_notification_preferences_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_notification_preferences PRIMARY KEY (userId, category),
        CONSTRAINT FK_notification_preferences_user FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
      );`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const S = queryRunner.query.bind(queryRunner);
    // Reverse FK order — safe full rollback.
    await S(`DROP TABLE IF EXISTS notification_preferences;`);
    await S(`DROP TABLE IF EXISTS notifications;`);
    await S(`DROP TABLE IF EXISTS activity_events;`);
    await S(`DROP TABLE IF EXISTS audit_logs;`);
    await S(`DROP TABLE IF EXISTS system_settings;`);
    await S(`DROP TABLE IF EXISTS catalog_items;`);
    await S(`DROP TABLE IF EXISTS catalog_types;`);
    await S(`DROP TABLE IF EXISTS refresh_tokens;`);
    await S(`DROP TABLE IF EXISTS group_roles;`);
    await S(`DROP TABLE IF EXISTS group_members;`);
    await S(`DROP TABLE IF EXISTS user_groups;`);
    await S(`DROP TABLE IF EXISTS role_permissions;`);
    await S(`DROP TABLE IF EXISTS user_roles;`);
    await S(`DROP TABLE IF EXISTS permissions;`);
    await S(`DROP TABLE IF EXISTS roles;`);
    await S(`DROP TABLE IF EXISTS users;`);
  }
}
