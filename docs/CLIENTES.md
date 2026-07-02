# Modelo de clientes — base + copias por rama

## Decisión (2026-07-01)

Con un volumen esperado de pocos clientes (~3 en el primer año) pero personalización profunda por cliente (tienda de producto vs. servicios, integraciones distintas), se descartó multi-tenant compartido (tabla `tenants` + un solo deploy) a favor de un modelo más simple: **una copia de la base por cliente, vía rama de git.**

- **`main` es la base oficial.** Ahí van las mejoras generales del motor: sesiones, canales, guardrails anti-alucinación, prompt base, tools comunes de Shopify.
- **Cada cliente es una rama propia**, creada desde `main`: `client/<nombre>`. Ahí vive su personalización (prompt, tools específicas, config, integraciones a medida) sin afectar a `main` ni a otras ramas de cliente.
- Las ramas de cliente **no están conectadas entre sí**. Si `main` mejora después de que una rama de cliente ya existe, esa mejora **no llega sola** — hay que traerla a mano con `git cherry-pick` (o merge) del commit puntual hacia cada rama de cliente que se quiera actualizar.
- Para que ese cherry-pick siga siendo barato con el tiempo, conviene que la personalización de cada cliente se concentre en zonas delimitadas (prompt, tools nuevas, config) y se toque lo menos posible el motor central compartido con `main`.
- Si en el futuro el volumen de clientes crece y esto deja de ser sostenible a mano, se puede migrar al modelo multi-tenant compartido ya bocetado en [PLAN.md §Fase 3](PLAN.md).

## Canal para demos de cliente (2026-07-02)

Solo existe **una línea de WhatsApp Business** (+1 305-339-8652, configurada en la base) y no se van a crear líneas nuevas por cada demo de cliente. Por eso:

- **El demo de WhatsApp real queda exclusivamente en la base (`main`)** — es la prueba de que el bot funciona en ese canal, no se toca por cliente.
- **Las personalizaciones por cliente (`client/<nombre>`) se demuestran con el widget web**, [public/widget.html](../public/widget.html) — ya está en la base, estilizado como WhatsApp mismo, y es multi-tenant por URL (`widget.html?shop=<tienda>.myshopify.com`), sin depender de ninguna línea telefónica. No hace falta construir nada nuevo (se evaluó Telegram como alternativa y se descartó por ser trabajo duplicado — el widget ya cumple la misma función de "chat de mentira" para demos).
- Si algún cliente puntual necesita WhatsApp real más adelante, se evalúa caso por caso (línea propia del cliente, o coordinar uso de la línea de la base).

## Clientes activos

| Cliente | Rama | Creado | Estado |
|---|---|---|---|
| ANISKA | `client/aniska` | 2026-07-01 | Rama creada desde `main`. Canal demo: widget web (no WhatsApp). Pendiente: dominio Shopify real, tipo de negocio, catálogo/branding. |
