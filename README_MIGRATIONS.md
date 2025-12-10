# Database Migrations

Dieses Projekt nutzt Supabase CLI für Datenbank-Migrationen.

## Migrationen ausführen

### 1. Mit Supabase CLI (empfohlen)

```bash
# Verbinde dich mit deinem Supabase-Projekt
supabase link --project-ref <your-project-ref>

# Führe alle ausstehenden Migrationen aus
supabase db push
```

### 2. Manuell via Supabase Dashboard

1. Öffne Supabase Dashboard → SQL Editor
2. Kopiere den Inhalt der Migration-Datei aus `supabase/migrations/`
3. Führe das SQL aus

### 3. Lokale Entwicklung (mit Supabase Local)

```bash
# Starte lokale Supabase-Instanz
supabase start

# Führe Migrationen aus
supabase migration up
```

## Neue Migration erstellen

```bash
# Erstelle eine neue Migration
supabase migration new <migration_name>

# Die Datei wird in supabase/migrations/ erstellt
```

## Migrationen-Struktur

- `supabase/migrations/` - Enthält alle Migrationen (timestampiert)
- Migrationen werden in chronologischer Reihenfolge ausgeführt
- Jede Migration sollte idempotent sein (kann mehrfach ausgeführt werden)

## Bestehende Migrationen

- `20241209140000_create_projects_permissions.sql` - Erstellt Projects, Teams, Companies und Permission Management

