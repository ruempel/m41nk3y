# serve as static web app
FROM nginx:alpine
WORKDIR /usr/share/nginx/html/
COPY . /usr/share/nginx/html/
ADD https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js bootstrap.js
ADD https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css bootstrap.css
ADD https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js qrcode.js
ADD 'https://github.com/google/material-design-icons/raw/master/variablefont/MaterialSymbolsOutlined%5BFILL,GRAD,opsz,wght%5D.woff2' css/material-symbols.woff2
ADD 'https://github.com/google/fonts/raw/main/ofl/roboto/Roboto%5Bwdth,wght%5D.ttf' css/roboto.ttf
RUN chmod -R 755 .
