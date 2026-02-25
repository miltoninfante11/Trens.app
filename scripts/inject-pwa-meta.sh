#!/bin/bash
set -e
VERSION=$(date +%s)

echo "🔧 Inyectando protecciones en TODOS los HTML de Expo..."
echo "📦 Versión: $VERSION"

# 1. Copiar solo los assets de public (NO el index.html)
echo "📁 Copiando assets públicos..."
for item in public/*; do
    name=$(basename "$item")
    if [ "$name" != "index.html" ]; then
        cp -r "$item" dist/
    fi
done

# 2. Copiar headers y redirects
cp _headers dist/ 2>/dev/null || true
cp _redirects dist/ 2>/dev/null || true

# 3. Encontrar TODOS los archivos HTML
HTML_FILES=$(find dist -name "*.html" -type f)
TOTAL=$(echo "$HTML_FILES" | wc -l)
echo "📄 Encontrados $TOTAL archivos HTML"

# Meta tags PWA para barra negra
PWA_META='<meta name="theme-color" content="#000000"/>'
PWA_META+='<meta name="theme-color" media="(prefers-color-scheme: light)" content="#000000"/>'
PWA_META+='<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000"/>'
PWA_META+='<meta name="msapplication-navbutton-color" content="#000000"/>'
PWA_META+='<meta name="apple-mobile-web-app-capable" content="yes"/>'
PWA_META+='<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>'
PWA_META+='<meta name="apple-mobile-web-app-title" content="TRENS"/>'
PWA_META+='<meta name="mobile-web-app-capable" content="yes"/>'
PWA_META+='<link rel="manifest" href="/manifest.json"/>'
PWA_META+='<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"/>'

# Estilos de protección
PROTECTION_STYLES='<style id="trens-protection">html{background:#000!important}body{background:#000!important;margin:0!important}*{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;-webkit-tap-highlight-color:transparent!important}html,body{touch-action:pan-x pan-y!important;overscroll-behavior:none!important;-webkit-text-size-adjust:100%!important}input,textarea,[contenteditable="true"]{-webkit-user-select:text!important;user-select:text!important;touch-action:auto!important}img,video,a,button{-webkit-user-drag:none!important;touch-action:manipulation!important}</style>'

COUNT=0
for HTML_FILE in $HTML_FILES; do
    COUNT=$((COUNT + 1))
    
    # 3. Inyectar protection.js al inicio del head
    perl -i -pe "s|<head>|<head><script src=\"/protection.js?v=$VERSION\"></script>|" "$HTML_FILE" 2>/dev/null || true
    
    # 4. Reemplazar viewport de Expo
    perl -i -pe 's|<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no"/>|<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover"/>|g' "$HTML_FILE" 2>/dev/null || true
    
    # 5. Inyectar meta tags PWA después del viewport
    perl -i -pe "s|(user-scalable=no, viewport-fit=cover\"/>)|\\1$PWA_META|" "$HTML_FILE" 2>/dev/null || true
    
    # 6. Cambiar idioma a español
    sed -i 's/lang="en"/lang="es"/g' "$HTML_FILE" 2>/dev/null || true
    
    # 7. Agregar título
    perl -i -pe 's|<title data-rh="true"></title>|<title>TRENS - High Performance Fitness</title>|' "$HTML_FILE" 2>/dev/null || true
    
    # 8. Inyectar estilos de protección
    perl -i -pe "s|</head>|$PROTECTION_STYLES</head>|" "$HTML_FILE" 2>/dev/null || true
    
    # 9. Agregar style al body
    perl -i -pe 's|<body>|<body style="background-color:#000000;margin:0">|g' "$HTML_FILE" 2>/dev/null || true
    
    echo -ne "\r   Procesando: $COUNT/$TOTAL"
done

echo ""
echo ""
echo "✅ Protecciones inyectadas en $TOTAL archivos HTML"
echo ""
echo "📊 Verificando archivos clave:"
echo "   index.html: $(grep -c 'theme-color' dist/index.html 2>/dev/null || echo 0) theme-color tags"
echo "   login.html: $(grep -c 'theme-color' dist/login.html 2>/dev/null || echo 0) theme-color tags"
echo "   adn/index.html: $(grep -c 'theme-color' dist/adn/index.html 2>/dev/null || echo 0) theme-color tags"
