# Helios

Helios to panel na własny VPS. Z przeglądarki tworzysz serwery gier, strony WWW, skrzynki pocztowe i boty Discord. Każda gra działa w osobnym kontenerze Docker. Panel jest po polsku i po angielsku.

Helios is a panel for your own VPS. From the browser you create game servers, websites, mailboxes, and Discord bots. Each game runs in its own Docker container. The panel is in Polish and in English.

Gry / games: Minecraft (Paper albo Vanilla), Counter-Strike 2, Garry's Mod, Farming Simulator 25, Team Fortress 2, GTA V (FiveM).

Licencja / license: wolno używać i zmieniać na własne potrzeby, także na serwerze, który sam prowadzisz. Nie wolno sprzedawać Heliosa ani zmienionej wersji jako własnego produktu, podpisywać go swoim nazwiskiem ani usuwać informacji o autorze. Pełny tekst jest w pliku `LICENSE`.

You may use and modify it for yourself, including a server you run. You may not sell Helios or a changed version as your own product, put your name on it, or remove the author notice. The full text is in `LICENSE`.

## Jedna komenda / One command

Na serwerze Ubuntu, jako root:

On an Ubuntu server, as root:

```bash
curl -fsSL https://raw.githubusercontent.com/iwo2003/projekt_dashbord/main/scripts/install-ubuntu.sh | sudo bash
```

Skrypt pobiera projekt do `/opt/helios`, instaluje Dockera i Node.js, buduje panel i uruchamia usługę `helios`. Po restarcie VPS panel wstaje sam. Na końcu wypisze adres, zwykle `http://ADRES_VPS:3000`. To samo polecenie uruchomione ponownie aktualizuje kod i przebudowuje panel. Katalog `data/` zostaje.

The script downloads the project into `/opt/helios`, installs Docker and Node.js, builds the panel, and starts the `helios` service. After a reboot the panel comes back by itself. At the end it prints the address, usually `http://YOUR_VPS_IP:3000`. Running the same command again updates the code and rebuilds the panel. The `data/` directory is kept.

Repozytorium musi być publiczne, inaczej GitHub zwraca 404 i komenda nic nie pobierze.

The repository has to be public. Otherwise GitHub returns 404 and the command downloads nothing.

## Po polsku

Przy pierwszym wejściu zakładasz konto właściciela. Hasło: minimum 10 znaków, litera i cyfra. Od razu możesz włączyć dwuetapowe logowanie. Kolejne osoby dodajesz w panelu i ograniczasz im uprawnienia.

Port `3000` musi być otwarty w zaporze dostawcy VPS. Panel i strony po domenie używają też portów `80` i `443`. Skrypt dopuszcza je w `ufw`, razem z grami:

- `25565` — Minecraft
- `27015` i `27020` — Counter-Strike 2 oraz Team Fortress 2
- `27016` — Garry's Mod
- `10823` i `10824` — Farming Simulator 25
- `30120` TCP i UDP — GTA V (FiveM)
- `3306` — MySQL
- `2222` — SFTP
- `21` oraz `21000–21010` — FTP
- `25`, `465`, `587`, `993` — poczta

Domenę panelu i stronę dodajesz już w panelu. Caddy słucha na `80` i `443`, więc w Cloudflare może zostać pomarańczowa chmurka.

Logi i restart:

```bash
journalctl -u helios -f
sudo systemctl restart helios
sudo systemctl status helios
```

Serwery gier startują w Dockerze. Bez Dockera panel się otwiera, ale utworzenie serwera kończy się komunikatem, że Docker nie odpowiada.

Token Steam (GSLT) wklejasz przy tworzeniu serwera CS2, Garry's Mod i Team Fortress 2. Darmowy token jest na [steamcommunity.com/dev/managegameservers](https://steamcommunity.com/dev/managegameservers). AppID: CS2 `730`, Garry's Mod `4000`, Team Fortress 2 `440`.

GTA V działa jako serwer FiveM. Przy tworzeniu wklejasz darmowy klucz z [keymaster.fivem.net](https://keymaster.fivem.net). Domyślny port to `30120` (TCP i UDP). W grze gracze naciskają F8 i wpisują `connect` oraz adres serwera. Nazwę, opis, liczbę miejsc, pamięć i OneSync ustawiasz w panelu. Zasoby wrzucasz w plikach do katalogu `resources`, a w `server.cfg` dopisujesz `ensure nazwa`. Zapis ustawień odtwarza `server.cfg` i zostawia te dopisane linie.

Farming Simulator 25 nie jest w Steam. Po utworzeniu serwera wrzuć rozpakowane pliki z portalu GIANTS do katalogu `installer`.

Dane panelu, światy i kopie zostają w `/opt/helios/data`. Nie kasuj tego katalogu przy aktualizacji.

## In English

On the first visit you create the owner account. The password needs at least 10 characters, with a letter and a digit. You can turn on two-step sign-in right away. You add other people in the panel and limit what they can do.

Port `3000` must be open in the VPS provider firewall. The panel and hosted sites also use ports `80` and `443`. The script allows those in `ufw`, along with the games:

- `25565` — Minecraft
- `27015` and `27020` — Counter-Strike 2 and Team Fortress 2
- `27016` — Garry's Mod
- `10823` and `10824` — Farming Simulator 25
- `30120` TCP and UDP — GTA V (FiveM)
- `3306` — MySQL
- `2222` — SFTP
- `21` and `21000–21010` — FTP
- `25`, `465`, `587`, `993` — mail

You add the panel domain and the site inside the panel. Caddy listens on `80` and `443`, so the Cloudflare proxy can stay on.

Logs and restart:

```bash
journalctl -u helios -f
sudo systemctl restart helios
sudo systemctl status helios
```

Game servers run in Docker. Without Docker the panel still opens, but creating a server ends with a message that Docker is not responding.

Paste a Steam token (GSLT) when you create a CS2, Garry's Mod, or Team Fortress 2 server. A free token is at [steamcommunity.com/dev/managegameservers](https://steamcommunity.com/dev/managegameservers). App IDs: CS2 `730`, Garry's Mod `4000`, Team Fortress 2 `440`.

GTA V runs as a FiveM server. When you create it, paste a free key from [keymaster.fivem.net](https://keymaster.fivem.net). The default port is `30120` (TCP and UDP). In the game, players press F8 and type `connect` plus the server address. You set the name, description, slots, memory, and OneSync in the panel. Upload resources into the `resources` folder, then add `ensure name` in `server.cfg`. Saving settings rebuilds `server.cfg` and keeps those extra lines.

Farming Simulator 25 is not on Steam. After you create the server, upload the unpacked GIANTS files into the `installer` folder.

Panel data, worlds, and backups stay in `/opt/helios/data`. Do not delete that directory when you update.
