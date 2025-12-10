#!/bin/bash

# Script zum Ausführen von Supabase Migrationen
# Verwendung: ./scripts/run_migrations.sh

set -e

echo "🔄 Supabase Migrationen ausführen..."

# Prüfe ob Supabase CLI installiert ist
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI ist nicht installiert."
    echo "   Installiere mit: brew install supabase/tap/supabase"
    exit 1
fi

# Prüfe ob Projekt verlinkt ist
if [ ! -f ".supabase/config.toml" ]; then
    echo "⚠️  Supabase-Projekt ist noch nicht verlinkt."
    echo "   Führe aus: supabase link --project-ref <your-project-ref>"
    echo ""
    echo "   Oder manuell im Dashboard:"
    echo "   1. Öffne Supabase Dashboard → SQL Editor"
    echo "   2. Führe die Migration aus: supabase/migrations/20241209140000_create_projects_permissions.sql"
    exit 1
fi

# Führe Migrationen aus
echo "📦 Führe Migrationen aus..."
supabase db push

echo "✅ Migrationen erfolgreich ausgeführt!"

