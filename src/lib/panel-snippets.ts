export function nginxBeside(host: string, port: number) {
    return `server {
    listen 80;
    server_name ${host};

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
`;
}

export function caddyBeside(host: string, port: number) {
  return `${host} {
    reverse_proxy 127.0.0.1:${port}
}
`;
}
