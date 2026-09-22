# Helios

Panel VPS do serwerów gier, stron, poczty i botów Discord. Jedna komenda stawia go na czystym Ubuntu.

A VPS panel for game servers, websites, mail, and Discord bots. One command installs it on a fresh Ubuntu machine.

Gry / games: Minecraft (Paper albo Vanilla), Counter-Strike 2, Garry's Mod, Farming Simulator 25, Team Fortress 2.

## Jedna komenda / One command

Na serwerze Ubuntu, jako root:

On an Ubuntu server, as root:

```bash
curl -fsSL https://raw.githubusercontent.com/iwo2003/projekt_dashbord/main/scripts/install-ubuntu.sh | sudo bash
```

Skrypt sam pobiera projekt do `/opt/helios`, instaluje Dockera i Node.js, buduje panel i uruchamia usługę `helios`. Po restarcie VPS panel wstaje sam. Na końcu wypisze adres, zwykle `http://ADRES_VPS:3000`.

The script downloads the project into `/opt/helios`, installs Docker and Node.js, builds the panel, and starts the `helios` service. After a reboot the panel comes back by itself. At the end it prints the address, usually `http://YOUR_VPS_IP:3000`.

To samo polecenie uruchomione ponownie aktualizuje kod i przebudowuje panel. Katalog `data/` zostaje.

Running the same command again updates the code and rebuilds the panel. The `data/` directory is kept.

## Po polsku

Przy pierwszym wejściu w przeglądarce zakładasz konto właściciela. Hasło: minimum 10 znaków, litera i cyfra. Od razu możesz włączyć dwuetapowe logowanie.

Port `3000` musi być otwarty w zaporze dostawcy VPS. Panel i strony po domenie używają też portów `80` i `443`. Skrypt dopuszcza je w `ufw`, razem z grami `25565` (Minecraft), `27015`/`27020` (CS2 i Team Fortress 2), `27016` (Garry's Mod), `10823`/`10824` (Farming Simulator 25), `3306` (MySQL), `2222` (SFTP), `21` i `21000–21010` (FTP) oraz pocztą: `25`, `465`, `587` i `993`.

Domenę panelu i stronę dodajesz już w panelu. Caddy słucha na `80` i `443`, więc w Cloudflare może zostać pomarańczowa chmurka.

Logi i restart:

```bash
journalctl -u helios -f
sudo systemctl restart helios
sudo systemctl status helios
```

Serwery gier startują w Dockerze. Bez Dockera panel się otwiera, ale utworzenie serwera kończy się komunikatem, że Docker nie odpowiada.

Token Steam (GSLT) wklejasz przy tworzeniu serwera CS2, Garry's Mod i Team Fortress 2. Darmowy token jest na [steamcommunity.com/dev/managegameservers](https://steamcommunity.com/dev/managegameservers). AppID: CS2 `730`, Garry's Mod `4000`, Team Fortress 2 `440`.

Farming Simulator 25 nie jest w Steam. Po utworzeniu serwera wrzuć rozpakowane pliki z portalu GIANTS do katalogu `installer`.

Dane panelu, światy i kopie zostają w `/opt/helios/data`. Nie kasuj tego katalogu przy aktualizacji.

## In English

On the first visit you create the owner account in the browser. The password needs at least 10 characters, with a letter and a digit. You can turn on two-step sign-in right away.

Port `3000` must be open in the VPS provider firewall. The panel and hosted sites also use ports `80` and `443`. The script allows those in `ufw`, along with the games `25565` (Minecraft), `27015`/`27020` (CS2 and Team Fortress 2), `27016` (Garry's Mod), `10823`/`10824` (Farming Simulator 25), `3306` (MySQL), `2222` (SFTP), `21` and `21000–21010` (FTP), and mail: `25`, `465`, `587`, and `993`.

You add the panel domain and the site inside the panel. Caddy listens on `80` and `443`, so the Cloudflare proxy can stay on.

Logs and restart:

```bash
journalctl -u helios -f
sudo systemctl restart helios
sudo systemctl status helios
```

Game servers run in Docker. Without Docker the panel still opens, but creating a server ends with a message that Docker is not responding.

Paste a Steam token (GSLT) when you create a CS2, Garry's Mod, or Team Fortress 2 server. A free token is at [steamcommunity.com/dev/managegameservers](https://steamcommunity.com/dev/managegameservers). App IDs: CS2 `730`, Garry's Mod `4000`, Team Fortress 2 `440`.

Farming Simulator 25 is not on Steam. After you create the server, upload the unpacked GIANTS files into the `installer` folder.

Panel data, worlds, and backups stay in `/opt/helios/data`. Do not delete that directory when you update.
