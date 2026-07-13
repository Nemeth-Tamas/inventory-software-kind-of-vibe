# Raktárkezelő és Leltár Rendszer (Inventory & Stocktake System)

Ez a projekt egy produkcióra kész, Docker-alapú, magyar nyelvű raktárkezelő, vonalkód-olvasó barát és leltározó webalkalmazás, amelyet kis elektronikai és számítástechnikai szervizek számára terveztünk.

## 1. Rendszerarchitektúra és Portok

Az alkalmazás egy modern monorepo felépítést követ:
* **Backend**: Python 3.13 + FastAPI + SQLAlchemy 2 + PostgreSQL + Redis (SSE & háttérfeladatok csatornája).
* **Frontend**: React + TypeScript + Vite, gyorsbillentyű-vezérelt (Ctrl+K), valós idejű SSE frissítésekkel.
* **Fordított Proxy**: Nginx Proxy Manager mögé helyezhető portátirányítással.

A gazdagépen (host) használt egyedi portok az ütközések elkerülése végett:

| Szolgáltatás | Konténer Port | Gazdagép (Host) Port |
| :--- | :--- | :--- |
| **Frontend (React)** | 80 | **18080** |
| **Backend (FastAPI)** | 18000 | **18000** |
| **PostgreSQL** | 5432 | **15432** (Csak belső hálózat) |
| **Redis** | 6379 | **16379** (Csak belső hálózat) |

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

Az adatbázis inicializálása után a rendszer létrehoz egy alapértelmezett rendszergazdát:
* **Felhasználónév**: `admin`
* **Jelszó**: `admin123`

Az első bejelentkezés után javasolt a jelszó azonnali megváltoztatása az adminisztrációs felületen.

### Fejlesztői tesztadatok feltöltése (Seed data)
A magyar nyelvű elektronikai alkatrészek, kábelek, szerviz kellékek és kategóriák azonnali feltöltéséhez küldjön egy POST kérést az alábbi végpontra (vagy kattintson a felületen a szinkron gombra):
```bash
curl -X POST http://localhost:18000/api/seed
```

---

## 5. Billingo V3 Integráció részletei

A Billingo API V3 integráció beállításához adja meg a titkos Billingo API kulcsát a `.env` fájl `BILLINGO_API_KEY` változójában.

### Megvalósított Billingo Funkciók:
* **Kapcsolat Ellenőrzés**: Kapcsolati státusz visszajelzés és hibakeresés a Billingo V3 partnerek lekérésével.
* **Termék Szinkronizálás (Push)**: Helyi termékek feltöltése a Billingo-ba (`POST /v3/products`), SKU és nettó/bruttó árak szinkronban tartásával.
* **Vevő Lekérés**: Vevő adatok szinkronizációja a számlázáshoz.

### Funkciók, amelyek a Billingo API korlátai miatt helyileg maradnak:
* **Készletszinkronizáció**: A Billingo API nem támogatja a közvetlen raktárkészlet szinkronizálást és mennyiségek egyeztetését. A készletmozgások valódi forrása (autoritatív adatbázisa) a helyi PostgreSQL adatbázis. A rendszer a szinkron státusznál egyértelműen jelzi: *"A Billingo API jelenleg nem biztosít támogatott készletszinkronizálási műveletet ehhez a funkcióhoz. A készletet ez a rendszer kezeli."*

---

## 6. Biztonsági Mentés és Visszaállítás (Backups)

A rendszer beépített, Docker-alapú PostgreSQL mentési rendszerrel rendelkezik, amely naponta 02:00-kor (Budapesti idő szerint) automatikusan lefut. A mentések az egyedi PostgreSQL egyedi dump formátumban (`pg_dump -Fc`) készülnek az alábbi névvel:
`inventory_YYYY-MM-DD_HHMMSS.dump`

A mentések a gazdagép `./backups` könyvtárában tárolódnak. A rendszer automatikusan megőrzi az utolsó **30 sikeres napi mentést**.

### Adminisztrátori műveletek konténeren belül:

* **Manuális mentés készítése:**
  ```bash
  docker compose exec backend python backup_manager.py run
  ```
* **Elérhető mentések listázása:**
  ```bash
  docker compose exec backend python backup_manager.py list
  ```
* **Mentési dump ellenőrzése (integrity check):**
  ```bash
  docker compose exec backend python backup_manager.py verify <mentes_neve.dump>
  ```
* **Automatizált visszaállítási teszt (átmeneti ellenőrző adatbázisban):**
  ```bash
  docker compose exec backend python backup_manager.py restore-temp
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

## 7. Automatikus Tesztek Futtatása

A háttérben futó backend integrációs és mentési egységtesztek futtatása:
```bash
docker compose exec backend pytest
```

---

## 8. Új és Továbbfejlesztett Funkciók

* **Terméklista Usability és Keresés:**
  - **Szerveroldali lapozás (Pagination):** Nagy termékkatalógusok hatékony kezelése (20, 50, 100, 250 soros oldalak).
  - **Gyorskeresés & Szűrés:** Keresés név, vonalkód, SKU és Billingo ID alapján; szűrés kategóriák, beszállítók, készletstátuszok (alacsony készlet, készlethiány, nullás), státusz (aktív/archivált) és Billingo-import szerint.
  - **Oszloprendezés (Sorting):** Kattintható oszlopfejlécek a gyors rendezéshez.
  - **Részletes Adatlap:** Sorra kattintva megnyitható termék-részletező modal.
  - **Archiválás & Visszaállítás:** Termékek ideiglenes kivezetése a forgalomból törlés helyett.

* **Nyitókészlet Rögzítése (Opening Stock Workflow):**
  - **Vonalkód-olvasó támogatás:** Kézi szkennelés 6-jegyű kódokkal, automatikus tétel-hozzáadással és hangjelzéssel.
  - **Excel Importálás:** Magyar nyelvű sablon letöltése és importálása.
  - **Row-level ellenőrzés és előnézet:** Feltöltés után a rendszer ellenőrzi a sorokat (ismeretlen vonalkódok, érvénytelen darabszámok, hibás tárhelyek, fájlon belüli duplikátumok kiszűrése).
  - **Vezetői megerősítés:** Már készletmozgással rendelkező termékek esetén a rendszer megerősítést (force apply) kér a módosításhoz.
  - **Követhetőség:** Minden rögzítés után automatikusan létrejön egy `Nyitó egyenleg` (`OPENING`) típusú tranzakció.

