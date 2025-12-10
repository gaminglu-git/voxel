# Supabase Storage Setup - Welcher Key wird benötigt?

## ⚠️ Wichtig: Service Role Key für Backend

Für Backend-Operationen mit Supabase Storage (wie das Erstellen von Signed URLs) benötigen Sie den **Service Role Key**, **NICHT** den anon/public key.

## Wo finde ich den Service Role Key?

1. Öffnen Sie Ihr **Supabase Dashboard**
2. Gehen Sie zu **Settings** → **API**
3. Scrollen Sie zu **Project API keys**
4. Kopieren Sie den **`service_role`** Key (NICHT den `anon` Key!)

## Konfiguration in `.env`

Erstellen Sie eine `.env` Datei im `backend/` Verzeichnis (falls nicht vorhanden):

```env
SUPABASE_URL=https://ihr-projekt-id.supabase.co
SUPABASE_KEY=ihr-service-role-key-hier
```

**Wichtig:** 
- Verwenden Sie den **Service Role Key** für `SUPABASE_KEY`
- Dieser Key hat **volle Berechtigungen** und umgeht Row Level Security (RLS)
- **Nie** diesen Key im Frontend verwenden oder committen!

## Unterschied zwischen den Keys:

| Key Typ | Verwendung | Berechtigungen |
|---------|-----------|----------------|
| **anon/public** | Frontend (client-seitig) | Eingeschränkt, respektiert RLS |
| **service_role** | Backend (server-seitig) | Volle Berechtigungen, umgeht RLS |

## Sicherheitshinweis

⚠️ **Der Service Role Key sollte NUR im Backend verwendet werden!**
- Nie im Frontend-Code
- Nie in Git commits (nutzen Sie `.gitignore`)
- Nie öffentlich teilen

## Testen ob der Key funktioniert

Nachdem Sie den Service Role Key in der `.env` gesetzt haben, starten Sie den Backend-Server neu:

```bash
cd backend
uvicorn main:app --reload
```

Der Upload sollte jetzt funktionieren, wenn der `bim-files` Bucket in Supabase existiert.

