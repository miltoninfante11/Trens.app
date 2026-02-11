# 🚀 TRENS - Comandos Rápidos

## 📱 PROBAR EN EXPO GO (Tu Teléfono)

### ⚡ Comando Único (Recomendado):

```bash
npm run start
```

**Luego:**

1. Escanea el QR con tu teléfono (descarga Expo Go primero)
2. ¡Listo! La app se abre automáticamente

### Alternativa si no funciona:

```bash
expo start --clear --tunnel
```

---

## 🌐 DESPLEGAR EN WEB (Cloudflare)

### ⚡ Deploy en 1 Comando:

```bash
npm run deploy:fast
```

**Qué hace:**

- Compila la app para web
- Inyecta protecciones PWA
- Sube a Cloudflare Pages
- Tu app estará en: **https://trens.app**

**Tiempo:** ~2-3 minutos

---

## 🔧 OTROS COMANDOS ÚTILES

| Comando                 | Qué Hace                                      |
| ----------------------- | --------------------------------------------- |
| `npm run web`           | Corre web localmente en http://localhost:8081 |
| `npm run web:build`     | Build web sin PWA inyecciones                 |
| `npm run lint -- --fix` | Corrige errores automáticamente               |
| `npm run clean`         | Limpia node_modules y .expo                   |
| `npm run reset`         | Limpia TODO y reinstala                       |

---

## 📋 CHECKLIST ANTES DE DESPLEGAR

- [ ] Tu teléfono tiene Expo Go descargado
- [ ] Estás conectado a internet (Tunnel o WiFi)
- [ ] El proyecto compiló sin errores: `npm run web:export`
- [ ] Tienes credenciales de Cloudflare configuradas
- [ ] Git está actualizado: `git status`

---

## 🎯 FLUJO COMPLETO

```bash
# 1. Verificar que compila
npm run web:export

# 2. Probar en teléfono
npm run start
# → Escanea QR

# 3. Cuando esté listo, desplegar
npm run deploy:fast

# 4. Commit + push
git add -A
git commit -m "Deploy TRENS ready"
git push
```

---

## 📊 STATUS ACTUAL

✅ **Compilación**: Todo funciona
✅ **Dependencias**: Todas instaladas
✅ **Config Expo**: SDK 54 listo
✅ **Web/PWA**: 53 rutas estáticas
✅ **Cloudflare**: Configurado
✅ **Supabase**: Auth + datos listos

---

**¿Necesitas ayuda?** Abre una issue en GitHub o revisa [DEPLOYMENT_READY.md](DEPLOYMENT_READY.md)
