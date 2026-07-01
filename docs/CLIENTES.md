# Modelo de clientes — base + copias por rama

## Decisión (2026-07-01)

Con un volumen esperado de pocos clientes (~3 en el primer año) pero personalización profunda por cliente (tienda de producto vs. servicios, integraciones distintas), se descartó multi-tenant compartido (tabla `tenants` + un solo deploy) a favor de un modelo más simple: **una copia de la base por cliente, vía rama de git.**

- **`main` es la base oficial.** Ahí van las mejoras generales del motor: sesiones, canales, guardrails anti-alucinación, prompt base, tools comunes de Shopify.
- **Cada cliente es una rama propia**, creada desde `main`: `client/<nombre>`. Ahí vive su personalización (prompt, tools específicas, config, integraciones a medida) sin afectar a `main` ni a otras ramas de cliente.
- Las ramas de cliente **no están conectadas entre sí**. Si `main` mejora después de que una rama de cliente ya existe, esa mejora **no llega sola** — hay que traerla a mano con `git cherry-pick` (o merge) del commit puntual hacia cada rama de cliente que se quiera actualizar.
- Para que ese cherry-pick siga siendo barato con el tiempo, conviene que la personalización de cada cliente se concentre en zonas delimitadas (prompt, tools nuevas, config) y se toque lo menos posible el motor central compartido con `main`.
- Si en el futuro el volumen de clientes crece y esto deja de ser sostenible a mano, se puede migrar al modelo multi-tenant compartido ya bocetado en [PLAN.md §Fase 3](PLAN.md).

## Clientes activos

| Cliente | Rama | Creado | Estado |
|---|---|---|---|
| ANISKA | `client/aniska` | 2026-07-01 | Rama recién creada desde `main`, pendiente de personalización (config de tienda, tipo de negocio, integraciones). |
