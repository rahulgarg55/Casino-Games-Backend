CREATE TABLE players(

    player_id CHAR(36) NOT NULL,

    username VARCHAR(255) NOT NULL,

    fullname VARCHAR(255) NOT NULL,

    patronymic VARCHAR(255) NOT NULL,

    photo TEXT NULL,

    dob DATETIME NULL,

    gender TINYINT NULL,

    email VARCHAR(255) NOT NULL,

    password_hash VARCHAR(255) NOT NULL,

    registration_date TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    last_login TIMESTAMP NULL,

    status VARCHAR(50) NULL DEFAULT 'active',

    is_verified VARCHAR(50) NULL DEFAULT 'no',

    is_2fa VARCHAR(50) NULL DEFAULT 'no',

    currency DECIMAL(15, 2) NULL,

    language CHAR(36) NULL,

    country CHAR(36) NULL,

    city CHAR(36) NULL,

    role_id CHAR(36) NULL,

    created_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    updated_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    PRIMARY KEY(`player_id`)

);

ALTER TABLE

    players ADD UNIQUE players_username_unique(`username`);

ALTER TABLE

    players ADD UNIQUE players_email_unique(`email`);

CREATE TABLE roles(

    role_id CHAR(36) NOT NULL,

    name VARCHAR(50) NOT NULL,

    description TEXT NULL,

    created_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    updated_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    PRIMARY KEY(`role_id`)

);

ALTER TABLE

    roles ADD UNIQUE roles_name_unique(`name`);

CREATE TABLE game_sessions(

    session_id CHAR(36) NOT NULL,

    player_id CHAR(36) NULL,

    game_type VARCHAR(50) NOT NULL,

    start_time TIMESTAMP NOT NULL,

    end_time TIMESTAMP NULL,

    status VARCHAR(50) NULL DEFAULT 'active',

    game_id CHAR(36) NULL,

    transaction_id CHAR(36) NULL,

    created_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    updated_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    PRIMARY KEY(`session_id`)

);

CREATE TABLE transactions(

    transaction_id CHAR(36) NOT NULL,

    player_id CHAR(36) NULL,

    amount DECIMAL(15, 2) NOT NULL,

    type VARCHAR(50) NOT NULL,

    status VARCHAR(50) NULL DEFAULT 'pending',

    timestamp TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    game_session_id CHAR(36) NULL,

    created_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    updated_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    PRIMARY KEY(`transaction_id`)

);

CREATE TABLE games(

    game_id CHAR(36) NOT NULL,

    name VARCHAR(255) NOT NULL,

    type VARCHAR(50) NOT NULL,

    provider_id CHAR(36) NULL,

    status VARCHAR(50) NULL DEFAULT 'active',

    created_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    updated_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    PRIMARY KEY(`game_id`)

);

ALTER TABLE

    games ADD UNIQUE games_name_unique(`name`);

CREATE TABLE providers(

    provider_id CHAR(36) NOT NULL,

    name VARCHAR(255) NOT NULL,

    description TEXT NULL,

    created_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    updated_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    PRIMARY KEY(`provider_id`)

);

ALTER TABLE

    providers ADD UNIQUE providers_name_unique(`name`);

CREATE TABLE player_balances(

    player_id CHAR(36) NOT NULL,

    current_balance DECIMAL(15, 2) NULL,

    bonus_balance DECIMAL(15, 2) NULL,

    last_updated TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    created_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    updated_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    PRIMARY KEY(`player_id`)

);

CREATE TABLE audit_logs(

    log_id CHAR(36) NOT NULL,

    player_id CHAR(36) NULL,

    action VARCHAR(255) NOT NULL,

    timestamp TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    details TEXT NULL,

    created_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    PRIMARY KEY(`log_id`)

);

CREATE TABLE sessions_cache(

    session_id CHAR(36) NOT NULL,

    player_id CHAR(36) NULL,

    game_state TEXT NOT NULL,

    expires_at TIMESTAMP NOT NULL,

    created_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    updated_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    PRIMARY KEY(`session_id`)

);

CREATE TABLE payment_methods(

    payment_method_id CHAR(36) NOT NULL,

    payment_method_name TEXT NOT NULL,

    payment_method_requesturl TEXT NOT NULL,

    payment_method_responseurl TEXT NOT NULL,

    payment_method_status VARCHAR(50) NULL DEFAULT 'active',

    created_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    updated_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    PRIMARY KEY(`payment_method_id`)

);

CREATE TABLE currencies(

    currency_id CHAR(36) NOT NULL,

    currency_name TEXT NOT NULL,

    currency_rate TEXT NOT NULL,

    currency_status VARCHAR(50) NULL DEFAULT 'active',

    created_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    updated_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    PRIMARY KEY(`currency_id`)

);

CREATE TABLE languages(

    language_id CHAR(36) NOT NULL,

    language_name TEXT NOT NULL,

    language_status VARCHAR(50) NULL DEFAULT 'active',

    created_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    updated_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    PRIMARY KEY(`language_id`)

);

CREATE TABLE countries(

    country_id CHAR(36) NOT NULL,

    country_name VARCHAR(50) NOT NULL,

    country_status VARCHAR(50) NULL DEFAULT 'active',

    created_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    updated_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    PRIMARY KEY(`country_id`)

);

ALTER TABLE

    countries ADD UNIQUE countries_country_name_unique(`country_name`);

CREATE TABLE cities(

    city_id CHAR(36) NOT NULL,

    city_name VARCHAR(255) NOT NULL,

    city_status VARCHAR(50) NULL DEFAULT 'active',

    created_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    updated_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    PRIMARY KEY(`city_id`)

);

CREATE TABLE gender(

    gender_id CHAR(36) NOT NULL,

    gender_text VARCHAR(50) NOT NULL,

    gender_status VARCHAR(50) NULL DEFAULT 'active',

    created_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    updated_at TIMESTAMP NULL DEFAULT 'DEFAULT  ( CURRENT_TIMESTAMP (  )  )',

    PRIMARY KEY(`gender_id`)

);

ALTER TABLE

    game_sessions ADD CONSTRAINT game_sessions_player_id_foreign FOREIGN KEY(`player_id`) REFERENCES players(`player_id`);

ALTER TABLE

    players ADD CONSTRAINT players_country_foreign FOREIGN KEY(`country`) REFERENCES countries(`country_id`);

ALTER TABLE

    transactions ADD CONSTRAINT transactions_game_session_id_foreign FOREIGN KEY(`game_session_id`) REFERENCES game_sessions(`session_id`);

ALTER TABLE

    sessions_cache ADD CONSTRAINT sessions_cache_player_id_foreign FOREIGN KEY(`player_id`) REFERENCES players(`player_id`);

ALTER TABLE

    game_sessions ADD CONSTRAINT game_sessions_game_id_foreign FOREIGN KEY(`game_id`) REFERENCES games(`game_id`);

ALTER TABLE

    players ADD CONSTRAINT players_gender_foreign FOREIGN KEY(`gender`) REFERENCES gender(`gender_id`);

ALTER TABLE

    game_sessions ADD CONSTRAINT game_sessions_transaction_id_foreign FOREIGN KEY(`transaction_id`) REFERENCES transactions(`transaction_id`);

ALTER TABLE

    players ADD CONSTRAINT players_language_foreign FOREIGN KEY(`language`) REFERENCES languages(`language_id`);

ALTER TABLE

    players ADD CONSTRAINT players_player_id_foreign FOREIGN KEY(`player_id`) REFERENCES player_balances(`player_id`);

ALTER TABLE

    audit_logs ADD CONSTRAINT audit_logs_player_id_foreign FOREIGN KEY(`player_id`) REFERENCES players(`player_id`);

ALTER TABLE

    players ADD CONSTRAINT players_city_foreign FOREIGN KEY(`city`) REFERENCES cities(`city_id`);

ALTER TABLE

    games ADD CONSTRAINT games_provider_id_foreign FOREIGN KEY(`provider_id`) REFERENCES providers(`provider_id`);

ALTER TABLE

    game_sessions ADD CONSTRAINT game_sessions_session_id_foreign FOREIGN KEY(`session_id`) REFERENCES sessions_cache(`session_id`);

ALTER TABLE

    players ADD CONSTRAINT players_currency_foreign FOREIGN KEY(`currency`) REFERENCES currencies(`currency_id`);

ALTER TABLE

    players ADD CONSTRAINT players_role_id_foreign FOREIGN KEY(`role_id`) REFERENCES roles(`role_id`);

ALTER TABLE

    transactions ADD CONSTRAINT transactions_player_id_foreign FOREIGN KEY(`player_id`) REFERENCES players(`player_id`);
