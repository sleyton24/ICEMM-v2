// PM2 process file para gestion-api (backend independiente del monolito).
// El PORT, DATABASE_URL, JWT_SECRET y CORS_ORIGIN vienen del archivo .env
// que la app carga vía `import 'dotenv/config'` al arrancar.
//
// Uso en el VPS:
//   pm2 start ecosystem.config.cjs
//   pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: 'gestion-api',
      script: 'dist/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
