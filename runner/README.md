Function Types to Support
  ┌────────────────────┬───────────────────────────┬───────────────────────────────┐
  │        Type        │         Decorator         │       Special Handling        │
  ├────────────────────┼───────────────────────────┼───────────────────────────────┤
  │ Basic function     │ @app.function()           │ ▶ Run                         │
  ├────────────────────┼───────────────────────────┼───────────────────────────────┤
  │ Local entrypoint   │ @app.local_entrypoint()   │ ▶ Run (local)                 │
  ├────────────────────┼───────────────────────────┼───────────────────────────────┤
  │ With parameters    │ def func(x: int)          │ Show input dialog             │
  ├────────────────────┼───────────────────────────┼───────────────────────────────┤
  │ GPU function       │ gpu="H100"                │ Show GPU badge, cost estimate │
  ├────────────────────┼───────────────────────────┼───────────────────────────────┤
  │ Scheduled          │ schedule=modal.Cron(...)  │ Show schedule, "Run Now"      │
  ├────────────────────┼───────────────────────────┼───────────────────────────────┤
  │ Web endpoint       │ @modal.fastapi_endpoint() │ Deploy + show URL             │
  ├────────────────────┼───────────────────────────┼───────────────────────────────┤
  │ Parametrized class │ @app.cls()                │ Expand methods, class params  │
  └────────────────────┴───────────────────────────┴───────────────────────────────┘


Upcoming features:
 - Show run ID and run status after clicking Run

 - Store recent runs in DB
 - Support parameterized functions
 - Deploy button?
 - Cost estimation??
 - Tab in IDE showing all targets.
  


