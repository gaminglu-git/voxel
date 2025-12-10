# Projekte mit Berechtigungs-Management

## Übersicht

Das System ermöglicht es, Projekte mit verschiedenen Eigentümer-Typen zu erstellen und diese mit anderen Usern, Teams oder Companies zu teilen.

## Datenbankschema

Führen Sie das SQL-Script aus, um die benötigten Tabellen zu erstellen:

```bash
# In Supabase Dashboard -> SQL Editor
# Oder via psql:
psql -h [your-db-host] -U postgres -d postgres -f backend/schema/projects_permissions.sql
```

Das Schema erstellt:
- `projects` - Projekte mit User/Team/Company Ownership
- `teams` - Teams
- `companies` - Companies
- `team_members` - Team-Mitgliedschaften
- `company_members` - Company-Mitgliedschaften
- `project_shares` - Projekt-Freigaben

## Backend API Endpunkte

### Projekte

- `POST /projects` - Projekt erstellen
- `GET /projects` - Alle Projekte auflisten (nur berechtigte)
- `GET /projects/{project_id}` - Einzelnes Projekt abrufen
- `PUT /projects/{project_id}` - Projekt aktualisieren
- `DELETE /projects/{project_id}` - Projekt löschen

### Freigaben

- `POST /projects/{project_id}/share` - Projekt freigeben
- `DELETE /projects/{project_id}/share/{share_id}` - Freigabe entfernen
- `GET /projects/{project_id}/shares` - Alle Freigaben auflisten

## Authentifizierung

Alle Endpunkte erfordern JWT-Token im `Authorization: Bearer <token>` Header.

Das Token wird automatisch aus dem Supabase Session Token extrahiert.

## Beispiel: Projekt erstellen

```typescript
// User-Projekt
await post('projects', {
  name: "Mein Projekt",
  file_path: "public/project.ifc",
  file_name: "project.ifc",
  file_size: 1024000,
  owner_type: "user"
});

// Team-Projekt
await post('projects', {
  name: "Team Projekt",
  file_path: "public/team-project.ifc",
  file_name: "team-project.ifc",
  owner_type: "team",
  owner_id: "team-uuid-here"
});
```

## Beispiel: Projekt freigeben

```typescript
// Mit User teilen
await post('projects/project-id/share', {
  project_id: "project-uuid",
  share_with_type: "user",
  share_with_id: "user-uuid",
  permission: "read"
});

// Mit Team teilen
await post('projects/project-id/share', {
  project_id: "project-uuid",
  share_with_type: "team",
  share_with_id: "team-uuid",
  permission: "write"
});
```

## Row Level Security (RLS)

Das Schema verwendet Supabase RLS Policies, um sicherzustellen, dass:
- User nur Projekte sehen, auf die sie Zugriff haben
- Nur Eigentümer Projekte löschen können
- Nur Eigentümer Freigaben erstellen können

Die Berechtigungsprüfung erfolgt automatisch durch die Datenbank.

## Environment Variables

Stellen Sie sicher, dass in `backend/.env` gesetzt ist:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret  # Optional, für Token-Validierung
```


