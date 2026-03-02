# Data Visualization — Tirocinio Next.js

Applicazione web per l'elaborazione di immagini con **segmentazione semantica automatica** (SAM) e **applicazione di gradienti/palette scientifiche**. Migrata da PHP/Vue.js a **Next.js 14** con React e TypeScript.

> **Demo**: [data-visualization-red-six.vercel.app](https://data-visualization-red-six.vercel.app/)

---

## Funzionalità

| Area | Descrizione |
|---|---|
| **Dataset** | Creazione e gestione di dataset di immagini |
| **Upload & Segmentazione** | Caricamento immagini e segmentazione automatica tramite SAM (Segment Anything Model) |
| **Editor Maschere** | Selezione, unione, rinomina e modifica colore delle maschere generate |
| **Palette Scientifiche** | Visualizzazione di colour map scientifiche (Viridis, Plasma, ecc.) e creazione di palette personalizzate |
| **Generazione** | Applicazione di gradienti e palette alle regioni segmentate con regolazione hue tramite slider |
| **Immagini Finali** | Galleria e download delle immagini elaborate |
| **Autenticazione** | Login e registrazione utenti con sessioni sicure |

---

## Architettura

```
tirocinio-nextjs/          ← Frontend + API proxy (Vercel)
├── app/
│   ├── api/               ← API Routes (Next.js)
│   │   ├── auth/          ← Login, logout, sessione
│   │   ├── sam/           ← Proxy verso il backend SAM
│   │   ├── datasets/      ← CRUD dataset
│   │   ├── images/        ← Gestione immagini
│   │   ├── palettes/      ← Gestione palette
│   │   └── ...
│   ├── dataset/           ← Pagina gestione dataset
│   ├── image/             ← Upload e segmentazione
│   ├── generation/        ← Generazione con gradienti
│   │   └── masks/         ← Editor maschere + palette
│   ├── images-list/       ← Lista immagini salvate
│   ├── final-images/      ← Galleria immagini finali
│   ├── palettes/          ← Gestione palette scientifiche
│   ├── login/             ← Pagina login
│   └── register/          ← Pagina registrazione
├── lib/
│   ├── db.ts              ← Connection pool MySQL
│   └── auth.ts            ← Gestione sessioni (iron-session)
├── components/
│   └── Navbar.tsx
└── SAM_server/            ← Backend SAM (HuggingFace Spaces)
    ├── sam_server.py       ← API FastAPI
    ├── Dockerfile
    └── requirements.txt
```

---

## Tech Stack

### Frontend & API
- **Next.js 14** — App Router, API Routes, SSR
- **React 18** + **TypeScript**
- **Bootstrap 5** + Bootstrap Icons
- **OpenCV.js** e **DeepLab.js** (caricati via CDN)

### Backend SAM
- **Python 3.9** + **FastAPI**
- **Segment Anything Model** (Meta AI)
- **PyTorch** + **OpenCV**
- Deployato su [HuggingFace Spaces](https://huggingface.co/spaces/benny2199/SAM_server)

### Database & Auth
- **MySQL** (via `mysql2`)
- **iron-session** per sessioni crittografate
- **bcryptjs** per hashing password

### Hosting
- **Frontend**: [Vercel](https://vercel.com)
- **SAM Backend**: [HuggingFace Spaces](https://huggingface.co/spaces/benny2199/SAM_server) (Docker)

---

## Setup Locale

### Prerequisiti
- **Node.js** ≥ 18
- **MySQL** (es. XAMPP, WAMP, o MySQL Server) sulla porta 3307
- **Python 3.9+** (solo se si vuole eseguire il backend SAM in locale)

### 1. Installazione

```bash
git clone https://github.com/benedetta2199/Data-Visualization.git
cd tirocinio-nextjs
npm install
```

### 2. Configurazione ambiente

Copia il file di esempio e personalizzalo:

```bash
cp .env.example .env.local
```

Contenuto di `.env.local`:

```env
# Database MySQL
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=tirocinio
DB_PORT=3307

# Sessione
SESSION_SECRET=una_chiave_segreta_di_almeno_32_caratteri

# SAM Backend
# Per usare HuggingFace Spaces (consigliato):
SAM_BACKEND_URL=https://benny2199-sam-server.hf.space
# Per usare il backend locale:
# SAM_BACKEND_URL=http://localhost:8000
```

### 3. Avvio

```bash
npm run dev
```

L'app sarà disponibile su `http://localhost:3000`.

---

## SAM Backend (opzionale — sviluppo locale)

Se vuoi eseguire il backend di segmentazione in locale:

```bash
cd SAM_server
pip install -r requirements.txt
```

Scarica il checkpoint del modello SAM da [segment-anything](https://github.com/facebookresearch/segment-anything#model-checkpoints) e posizionalo in `SAM_server/checkpoints/`.

```bash
python sam_server.py
```

Il server sarà disponibile su `http://localhost:8000`. Documentazione API su `http://localhost:8000/docs`.

### Endpoint principali

| Metodo | Endpoint | Descrizione |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/load-model/{model_type}` | Carica un modello SAM (`vit_b`, `vit_l`, `vit_h`) |
| `POST` | `/segment-auto` | Segmentazione automatica di un'immagine |
| `POST` | `/combine-masks` | Combina maschere (unione, intersezione, differenza) |
| `POST` | `/smooth-mask` | Smoothing morfologico delle maschere |
| `POST` | `/remove-object` | Rimuove oggetti dall'immagine |

---

## Deploy

### Frontend (Vercel)

1. Collega la repo a [Vercel](https://vercel.com)
2. Configura le variabili d'ambiente:
   - `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`
   - `SESSION_SECRET`
   - `SAM_BACKEND_URL=https://benny2199-sam-server.hf.space`
3. Deploy automatico ad ogni push

### SAM Backend (HuggingFace Spaces)

Il backend è deployato come Docker Space. La cartella `SAM_server/` contiene tutto il necessario:
- `Dockerfile` — configurazione container
- `sam_server.py` — server FastAPI
- `requirements.txt` — dipendenze Python
- `checkpoints/` — modelli SAM

L'URL diretto dello Space è: `https://benny2199-sam-server.hf.space`

---

## Licenza

Progetto sviluppato come tirocinio universitario.
