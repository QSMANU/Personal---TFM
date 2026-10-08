---
id: ctx-comandos
project: Personal - Shared-MCP-Local
title: Cheatsheet de comandos (sharedctx)
type: reference
tags: comandos, cheatsheet
---
```powershell
# estado y modo
sharedctx status                    # modo, app, proyecto activo y CÓMO lo detectó
sharedctx mode ask                  # off | readonly | ask | on
sharedctx projects                  # proyectos, alias y rutas
sharedctx audit --limit 40          # historial

# proyecto activo y alias
sharedctx use "OAT - Architecture"  # fija el proyecto para TODAS las apps
sharedctx use --clear               # vuelve a la detección automática
sharedctx alias "Personal - TFM" "TFM Master"

# publicar sin depender de ninguna app
sharedctx add --title "..." --content "..." --project "Personal - TFM"
sharedctx add --project "OAT - Architecture" --title "..." --clipboard
sharedctx handoff --project "Personal - TFM" --file .\resumen.md
Get-Content log.txt | sharedctx handoff --project "OAT - Architecture" --file -
sharedctx note --project "Personal - TFM"     # Bloc de notas con plantilla
sharedctx inbox && sharedctx ingest           # bandeja: dejás archivos y los publica

# aprobaciones (modo ask)
sharedctx pending
sharedctx approve all      |  sharedctx reject all

# leer y exportar
sharedctx list "Personal - TFM"
sharedctx show <id> --project "Personal - TFM"
sharedctx export --project "Personal - TFM" --out "C:\...\ChatGPT\Personal - TFM\.shared"

# servidor HTTP opcional (solo loopback)
sharedctx serve --http --port 3111        # MCP: http://127.0.0.1:3111/mcp
```

**Límite real de Windows:** `--content` con textos muy grandes falla (límite de ~32 KB de la línea de
comandos). Para contenido grande usá `--file`, `--clipboard` o la bandeja con `ingest`.
