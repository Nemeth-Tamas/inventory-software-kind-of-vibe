# Raktárkezelő és Leltár Rendszer (Inventory & Stocktake System)

[![CI](https://github.com/Nemeth-Tamas/inventory-software-kind-of-vibe/actions/workflows/ci.yml/badge.svg)](https://github.com/Nemeth-Tamas/inventory-software-kind-of-vibe/actions/workflows/ci.yml)

Aktívan fejlesztett, saját használatra készült raktárkezelő rendszer.

Ez a projekt egy produkcióra kész, Docker-alapú, magyar nyelvű raktárkezelő, vonalkód-olvasó barát és leltározó webalkalmazás, amelyet kis elektronikai és számítástechnikai szervizek számára terveztünk.

## 1. Rendszerarchitektúra és Portok

Az alkalmazás egy modern monorepo felépítést követ:
* **Backend**: Python 3.13 + FastAPI + SQLAlchemy 2 + PostgreSQL + Redis (SSE & háttérfeladatok csatornája).
* **Frontend**: React + TypeScript + Vite, gyorsbillentyű-vezérelt (Ctrl+K), valós idejű SSE frissítésekkel.
* **Fordított Proxy**: Nginx Proxy Manager mögé helyezhető portátirányítással.

A gazdagépen (host) használt egyedi portok az-üzemi környezet biztonsága érdekében elrejtettek (nincsenek publikusan kitéve):

| Szolgáltatás | Konténer Port | Gazdagép (Host) Port |
| :--- | :--- | :--- |
| **Frontend (React)** | 80 | **18080** |
| **Backend (FastAPI)** | 18000 | **18000** |
| **PostgreSQL** | 5432 | Csak belső Docker hálózat (Dev környezetben 127.0.0.1:15432) |
| **Redis** | 6379 | Csak belső Docker hálózat (Dev környezetben 127.0.0.1:16379) |

---

## 2. Nginx Proxy Manager Beállítások

A tartományneve (pl. `https://inventory.ntsexp.site`) átirányításához az alábbiakat kell beállítani az NPM admin felületén:
1. Hozzon létre egy új **Proxy Host**-ot: `inventory.ntsexp.site`
2. **Scheme**: `http`
3. **Forward Hostname/IP**: A fejlesztői gép belső IP címe (vagy ha közös Docker hálózaton vannak, a frontend konténer neve: `inventory-frontend`)
4. **Forward Port**: `18080`
5. Kapcsolja be a **Block Common Exploits** és a **Websockets Support** opciókat (a Server-Sent Events zavartalan áramlásához).
6. SSL lapfülön igényeljen ingyenes **Let's Encrypt** tanúsítványt a biztonságos HTTPS eléréshez.

---

## 3. Telepítési és Indítási Parancsok

### Lépés 1: Környezeti változók konfigurálása
Hozza létre a `.env` fájlt a gyökérkönyvtárban az `.env.example` alapján:
```bash
cp .env.example .env
```

### Lépés 2: Szolgáltatások elindítása Docker-rel
Futtassa az alábbi parancsot az összes konténer felépítéséhez és háttérben való futtatásához:
```bash
docker compose up --build -d
```

### Lépés 3: Adatbázis inicializálása és Migrációk
A konténerek elindulása után hajtsa végre az adatbázis sémák felépítését és az alapértelmezett adatok betöltését:
```bash
docker compose exec backend python init_db.py
```

---

## 4. Kezdeti Rendszerbeállítások (Admin setup)

Az adatbázis inicializálása után a rendszer létrehoz egy alapértelmezett rendszergazdát (csak ha még nincs adminisztrátor az adatbázisban):
* **Felhasználónév**: `admin`
* **Jelszó**: `admin123`

Az első bejelentkezés után a rendszer azonnal kéri a jelszó megváltoztatását (kötelező jelszócsere szabály).

### Adminisztrátori jelszó helyreállítása (CLI):
Ha elfelejtette a jelszót, vagy a produkciós telepítés után az adatbázisban már létező adminisztrátori fiók miatt az `.env` fájlban megadott jelszó nem lépett életbe, futtassa a helyreállító scriptet a backend konténeren belül:
```bash
docker compose exec backend python reset_admin_password.py <felhasználónév> <új_jelszó>
```
Ez a parancs beállítja az új jelszót, feloldja a kötelező jelszócserét és aktiválja a fiókot.

---

## 5. Billingo V3 Integráció részletei

A Billingo API V3 integráció beállításához adja meg a titkos Billingo API kulcsát a `.env` fájl `BILLINGO_API_KEY` változójában.

### Fontos működési szabály:
* **Billingo szinkronizáció iránya**: A Billingo integráció **kizárólag importálásra** szolgál. A meglévő termékek beolvasására szolgál kiindulási alapként. A rendszer **nem szinkronizál vissza adatot a Billingo-ba**. A helyi adatbázis a hiteles forrás (autoritatív katalógus).

---

## 6. Biztonsági Mentés és Visszaállítás (Backups)

A rendszer beépített PostgreSQL mentési rendszerrel rendelkezik, amely naponta 02:00-kor (Budapesti idő szerint) automatikusan lefut.
* **Catch-up (downtime utáni catch-up)**: Ha a rendszer leállás miatt kihagyja az 02:00-s futást, elindulás után észleli a hiányt, és azonnal pótolja a mentést.
* **Megőrzés**: A rendszer automatikusan megőrzi az utolsó **30 sikeres napi mentést**.

### Adminisztrátori műveletek konténeren belül:

* **Manuális mentés készítése:**
  ```bash
  docker compose exec backend python backup_manager.py run-backup
  ```
* **Elérhető mentések listázása:**
  ```bash
  docker compose exec backend python backup_manager.py list-backups
  ```
* **Mentési dump ellenőrzése (integrity check):**
  ```bash
  docker compose exec backend python backup_manager.py verify-backup <mentes_neve.dump>
  ```
  Vagy a legújabb ellenőrzése:
  ```bash
  docker compose exec backend python backup_manager.py verify-backup --latest
  ```
* **Automatizált visszaállítási teszt (átmeneti ellenőrző adatbázisban):**
  ```bash
  docker compose exec backend python backup_manager.py restore-temp <mentes_neve.dump>
  ```
  Vagy a legújabb tesztelése:
  ```bash
  docker compose exec backend python backup_manager.py restore-temp --latest
  ```

### Biztonsági mentés visszaállítása a gazdagépről:

A visszaállítás biztonsági okokból **csak kézi indítással és megerősítéssel** futtatható a gazdagépről az alábbi biztonságos parancsfájlok használatával (amelyek leállítják az írási műveleteket az adatbázis zárolásával a helyreállítás alatt):

* **Linux (Bash):**
  ```bash
  ./restore.sh --backup ./backups/inventory_YYYY-MM-DD_HHMMSS.dump --confirm
  ```
* **Windows (PowerShell):**
  ```powershell
  .\restore.ps1 -BackupFile .\backups\inventory_YYYY-MM-DD_HHMMSS.dump -Confirm
  ```

---

## 7. Rendszer Egészségügyi Végpontok (Health & Readiness)

Az alkalmazás dedikált végpontokat biztosít a rendszer állapotának nyomon követésére:

* **Liveness végpont**: `GET /api/health/live`
  - Megerősíti, hogy az API folyamat fut.
* **Readiness végpont**: `GET /api/health/ready`
  - Visszaadja a kritikus függőségek részletes állapotát (adatbázis kapcsolat, Redis ping, Alembic adatbázis migrációs séma verzió, biztonsági mentések státuszának ellenőrzése és legrégebbi mentés kora, Celery háttérfolyamat elérhetőség).
  - Ha kritikus hiba van (pl. adatbázis vagy redis elérhetetlen), `503 Service Unavailable` hibakódot ad vissza.

* **Docker Healthcheck**: A Docker környezet automatikusan ezt a readiness végpontot használja az egészségügyi ellenőrzésekhez.

---

## 8. Biztonsági és Jogosultsági Hardening

* **Kötelező biztonsági korlátozások élesben**: Produkciós üzemmódban (`APP_ENV=production`) a backend elutasítja az elindulást, ha a jelszavak, kulcsok vagy titkok (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `ADMIN_USER`, `ADMIN_PASSWORD`) alapértelmezett értéken maradtak vagy hiányoznak.
* **Bejelentkezési korlátozás**: Redis alapú sliding-window bejelentkezés-védelem és késleltetés (3 rontás után várakoztat, 6 rontás után átmeneti 5 perces tiltást alkalmaz).
* **Biztonságos Vonalkód Generálás**: A `/api/products/generate-barcode` végpont csak bejelentkezett, termék-létrehozási jogosultsággal (ADMIN, LEADER, WAREHOUSE) rendelkező felhasználók számára érhető el. A végpont csak előnézetet ad vissza a következő szabad vonalkódról, a sorozatot nem égeti el a tényleges termékmentés előtt.
* **Adminisztrátori Védelem**: A rendszer megakadályozza az utolsó aktív adminisztrátor deaktiválását, törlését vagy szerepkörének módosítását, megelőzve az adminisztrátori zárolást (lockout).
* **Biztonsági Naplózás (Audit Log)**: Minden biztonsági szempontból kritikus esemény (sikeres/sikertelen bejelentkezések, jelszócserék, jogosultság változások, aktiválások) rögzítésre kerül az audit naplóban.
