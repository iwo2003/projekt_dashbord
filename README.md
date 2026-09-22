# Helios

Panel VPS do serwerów gier. Na start: Minecraft, Counter-Strike 2, Garry's Mod, Farming Simulator 25 i Team Fortress 2. Logowanie, konta z uprawnieniami, dwuetapowe kody z aplikacji, konsola, pliki, kopie i metryki maszyny.

## Instalacja na Ubuntu

Wgraj ten folder na VPS, na przykład do `/opt/helios`. Potem jedna komenda:

```bash
sudo bash scripts/install-ubuntu.sh
```

Skrypt instaluje Dockera i Node.js, buduje panel i uruchamia usługę `helios`. Po restarcie VPS panel wstaje sam. Na końcu wypisze adres, zwykle `http://ADRES_VPS:3000`.

Z Windowsa folder wgrasz tak (podmień adres VPS):

```powershell
scp -r "C:\Users\admin\Desktop\projekt dashbord\projekt_dashbord" root@ADRES_VPS:/opt/helios
```

Potem na serwerze:

```bash
cd /opt/helios && sudo bash scripts/install-ubuntu.sh
```

Przy pierwszym wejściu w przeglądarce zakładasz konto właściciela. Hasło: minimum 10 znaków, litera i cyfra. Od razu możesz włączyć dwuetapowe logowanie.

Port `3000` musi być otwarty w zaporze dostawcy VPS. Panel i strony po domenie używają też portów `80` i `443`. Skrypt dopuszcza je w `ufw`, razem z grami `25565` (Minecraft), `27015`/`27020` (CS2 i Team Fortress 2), `27016` (Garry's Mod), `10823`/`10824` (Farming Simulator 25), `3306` (MySQL), `2222` (SFTP), `21` i `21000–21010` (FTP) oraz pocztą: `25`, `465`, `587` i `993`.

Domenę panelu i stronę dodajesz już w panelu. Caddy sam słucha na `80` i `443`, więc Cloudflare może mieć pomarańczową chmurkę.

## Po instalacji

```bash
journalctl -u helios -f
sudo systemctl restart helios
sudo systemctl status helios
```

Serwery gier startują w Dockerze. Bez działającego Dockera panel się otwiera, ale utworzenie serwera CS2 albo Minecraft kończy się komunikatem, że Docker nie odpowiada.

Token CS2 (GSLT) wklejasz przy tworzeniu każdego serwera. Darmowy token jest na [steamcommunity.com/dev/managegameservers](https://steamcommunity.com/dev/managegameservers).

Dane panelu, światy i kopie zostają w katalogu `data/` obok tej aplikacji. Nie kasuj go przy aktualizacji.
