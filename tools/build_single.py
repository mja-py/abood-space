import re, base64, sys, os
P = sys.argv[1]; BUNDLE = sys.argv[2]; OUT = sys.argv[3]
html = open(f'{P}/index.html', encoding='utf-8').read()
css = open(f'{P}/css/style.css', encoding='utf-8').read()
def font(m):
    path = os.path.normpath(os.path.join(P, 'css', m.group(1)))
    return 'url(data:font/woff2;base64,' + base64.b64encode(open(path,'rb').read()).decode() + ')'
css = re.sub(r'url\((\.\./assets/fonts/[^)]+\.woff2)\)', font, css)
js = 'window.__aboodSW=true;' + open(BUNDLE, encoding='utf-8').read().replace('</script', '<\\/script')
fav = 'data:image/png;base64,' + base64.b64encode(open(f'{P}/assets/icons/favicon-32.png','rb').read()).decode()
head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
head = re.sub(r'<link rel="(manifest|apple-touch-icon|preload|modulepreload|stylesheet)"[^>]*>\n?', '', head)
head = re.sub(r'<link rel="icon"[^>]*>', f'<link rel="icon" type="image/png" href="{fav}">', head)
head = re.sub(r'<title>.*?</title>', '<title>Abood to the Moon</title>', head)
head = re.sub(r'<meta charset="utf-8">\n?', '', head)
body = re.sub(r'<script type="module" src="js/game.js"></script>', '', body)
out = head + '<style>\n' + css + '\n</style>\n' + body + '<script>\n' + js + '\n</script>\n'
open(OUT, 'w', encoding='utf-8').write(out)
print(len(out))
