# Helios

Panel VPS do serwerów gier. Na start: Counter-Strike 2 i Minecraft (Paper albo Vanilla). Logowanie, konta z uprawnieniami, dwuetapowe kody z aplikacji, konsola, pliki, kopie i metryki maszyny.

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

Port `3000` musi być otwarty w zaporze dostawcy VPS. Jeśli na serwerze działa `ufw`, skrypt sam dopuszcza panel, porty gier `25565` (Minecraft) i `27015`/`27020` (CS2), `3306` (MySQL), `2222` (SFTP), `21` i `21000–21010` (FTP) oraz pocztę: `25`, `465`, `587` i `993`.

## Po instalacji

```bash
journalctl -u helios -f
sudo systemctl restart helios
sudo systemctl status helios
```

Serwery gier startują w Dockerze. Bez działającego Dockera panel się otwiera, ale utworzenie serwera CS2 albo Minecraft kończy się komunikatem, że Docker nie odpowiada.

Token CS2 (GSLT) wklejasz przy tworzeniu każdego serwera. Darmowy token jest na [steamcommunity.com/dev/managegameservers](https://steamcommunity.com/dev/managegameservers).

Dane panelu, światy i kopie zostają w katalogu `data/` obok tej aplikacji. Nie kasuj go przy aktualizacji.
