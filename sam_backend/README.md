# SAM Backend per Segmentazione Immagini

Server FastAPI per la segmentazione di immagini usando SAM (Segment Anything Model) di Meta.

## Requisiti

- Python 3.8+
- CUDA (opzionale, per GPU acceleration)

## Installazione

```bash
cd sam_backend

# Crea un ambiente virtuale (consigliato)
python -m venv venv
.\venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

# Installa le dipendenze
pip install -r requirements.txt
```

## Download del Modello

Scarica uno dei checkpoint SAM da [GitHub](https://github.com/facebookresearch/segment-anything#model-checkpoints):

| Modello | Dimensione | Link |
|---------|------------|------|
| ViT-B | ~375MB | [sam_vit_b_01ec64.pth](https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth) |
| ViT-L | ~1.2GB | [sam_vit_l_0b3195.pth](https://dl.fbaipublicfiles.com/segment_anything/sam_vit_l_0b3195.pth) |
| ViT-H | ~2.5GB | [sam_vit_h_4b8939.pth](https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth) |

Posiziona il file nella cartella `sam_backend/checkpoints/`.

## Avvio del Server

```bash
python sam_server.py
```

Il server sarà disponibile su `http://localhost:8000`.

## API Endpoints

- `GET /health` - Verifica stato del server
- `GET /models` - Lista modelli disponibili
- `POST /load-model/{model_type}` - Carica un modello (vit_b, vit_l, vit_h)
- `POST /segment-with-image` - Segmenta con punti
- `POST /segment-auto` - Segmentazione automatica

## Utilizzo con Next.js

Assicurati che il server Python sia in esecuzione prima di usare SAM nella pagina `/generation` dell'app Next.js.
