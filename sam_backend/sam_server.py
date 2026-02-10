"""
SAM (Segment Anything Model) FastAPI Backend Server
Versione con segmentazione automatica e unione maschere

Run with: uvicorn sam_server:app --host 0.0.0.0 --port 8000 --reload
"""

import os
import io
import base64
import numpy as np
from typing import List, Optional, Dict, Any
from pathlib import Path
import json
import cv2

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from PIL import Image

# SAM imports
import torch
from segment_anything import sam_model_registry, SamPredictor, SamAutomaticMaskGenerator

app = FastAPI(
    title="SAM Segmentation API",
    description="API for automatic image segmentation using Segment Anything Model",
    version="2.0.0"
)

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model variables
sam_model = None
sam_predictor = None
mask_generator = None
current_model_type = None

# Cache for current image masks
current_image_masks: List[Dict[str, Any]] = []
current_image_shape = None

# Model checkpoint paths
MODEL_CHECKPOINTS = {
    "vit_b": "sam_vit_b_01ec64.pth",
    "vit_l": "sam_vit_l_0b3195.pth",
    "vit_h": "sam_vit_h_4b8939.pth",
}

CHECKPOINTS_DIR = Path(__file__).parent / "checkpoints"

# Color palette for masks
COLOR_PALETTE = [
    [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [255, 0, 255],
    [0, 255, 255], [255, 128, 0], [128, 0, 255], [0, 255, 128], [255, 0, 128],
    [128, 255, 0], [0, 128, 255], [255, 128, 128], [128, 255, 128], [128, 128, 255],
    [255, 255, 128], [255, 128, 255], [128, 255, 255], [192, 64, 64], [64, 192, 64],
    [64, 64, 192], [192, 192, 64], [192, 64, 192], [64, 192, 192], [160, 32, 240],
    [32, 160, 240], [240, 32, 160], [240, 160, 32], [32, 240, 160], [160, 240, 32],
]


class MaskResult(BaseModel):
    mask_id: int
    mask_base64: str
    score: float
    area: int
    coverage_percent: float
    color: List[int]
    bbox: List[int]  # x, y, width, height


class SegmentationResponse(BaseModel):
    success: bool
    masks: List[MaskResult]
    total_masks: int
    image_width: int
    image_height: int
    message: str = ""


class CombineMasksRequest(BaseModel):
    mask_indices: List[int]
    operation: str = "union"  # union, intersection, difference


class CombinedMaskResponse(BaseModel):
    success: bool
    mask_base64: str
    area: int
    coverage_percent: float
    source_indices: List[int]
    operation: str
    message: str = ""


def get_color(index: int) -> List[int]:
    """Get color from palette"""
    return COLOR_PALETTE[index % len(COLOR_PALETTE)]


def mask_to_base64(mask: np.ndarray, color: List[int], alpha: int = 150) -> str:
    """Convert binary mask to colored RGBA base64 image"""
    h, w = mask.shape
    colored_mask = np.zeros((h, w, 4), dtype=np.uint8)
    colored_mask[mask] = [color[0], color[1], color[2], alpha]
    
    img = Image.fromarray(colored_mask, mode='RGBA')
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


def binary_mask_to_base64(mask: np.ndarray) -> str:
    """Convert binary mask to grayscale base64 image"""
    mask_uint8 = (mask * 255).astype(np.uint8)
    img = Image.fromarray(mask_uint8, mode='L')
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model_loaded": sam_model is not None,
        "current_model": current_model_type,
        "device": str(torch.device("cuda" if torch.cuda.is_available() else "cpu")),
        "cached_masks": len(current_image_masks)
    }


@app.get("/models")
async def list_models():
    """List available SAM models"""
    available = []
    for model_type, checkpoint in MODEL_CHECKPOINTS.items():
        checkpoint_path = CHECKPOINTS_DIR / checkpoint
        available.append({
            "model_type": model_type,
            "checkpoint": checkpoint,
            "available": checkpoint_path.exists(),
            "path": str(checkpoint_path)
        })
    return {"models": available}


@app.post("/load-model/{model_type}")
async def load_model(model_type: str):
    """Load a SAM model"""
    global sam_model, sam_predictor, mask_generator, current_model_type
    
    if model_type not in MODEL_CHECKPOINTS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid model type. Choose from: {list(MODEL_CHECKPOINTS.keys())}"
        )
    
    checkpoint_path = CHECKPOINTS_DIR / MODEL_CHECKPOINTS[model_type]
    
    if not checkpoint_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Checkpoint not found at {checkpoint_path}. Download from https://github.com/facebookresearch/segment-anything#model-checkpoints"
        )
    
    try:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"Loading SAM model {model_type} on {device}...")
        
        sam_model = sam_model_registry[model_type](checkpoint=str(checkpoint_path))
        sam_model.to(device=device)
        
        sam_predictor = SamPredictor(sam_model)
        
        # Configure automatic mask generator with optimal settings
        mask_generator = SamAutomaticMaskGenerator(
            model=sam_model,
            points_per_side=32,
            pred_iou_thresh=0.88,
            stability_score_thresh=0.92,
            crop_n_layers=1 if model_type == 'vit_h' else 0,
            min_mask_region_area=100,
            box_nms_thresh=0.7
        )
        
        current_model_type = model_type
        
        return {
            "success": True,
            "message": f"Model {model_type} loaded successfully on {device}",
            "model_type": model_type,
            "device": str(device)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading model: {str(e)}")


@app.post("/segment-auto", response_model=SegmentationResponse)
async def segment_automatic(image: UploadFile = File(...)):
    """
    Automatically segment all objects in an image.
    This is the main endpoint - no point prompts needed.
    """
    global current_image_masks, current_image_shape, mask_generator
    
    if mask_generator is None:
        raise HTTPException(status_code=400, detail="No model loaded. Call /load-model first.")
    
    try:
        # Read and convert image
        contents = await image.read()
        img = Image.open(io.BytesIO(contents)).convert("RGB")
        img_array = np.array(img)
        
        current_image_shape = img_array.shape
        h, w = img_array.shape[:2]
        total_area = h * w
        
        print(f"Segmenting image {w}x{h}...")
        
        # Generate all masks automatically
        masks = mask_generator.generate(img_array)
        
        # Sort by area (largest first)
        masks = sorted(masks, key=lambda x: x['area'], reverse=True)
        
        # Store masks for later operations
        current_image_masks = masks
        
        print(f"Found {len(masks)} masks")
        
        # Convert to response format
        results = []
        for idx, mask_data in enumerate(masks):
            mask = mask_data["segmentation"]
            area = mask_data["area"]
            coverage = (area / total_area) * 100
            bbox = mask_data["bbox"]  # x, y, w, h
            score = mask_data.get("stability_score", mask_data.get("predicted_iou", 0.9))
            
            color = get_color(idx)
            mask_b64 = mask_to_base64(mask, color)
            
            results.append(MaskResult(
                mask_id=idx,
                mask_base64=mask_b64,
                score=float(score),
                area=int(area),
                coverage_percent=float(coverage),
                color=color,
                bbox=[int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])]
            ))
        
        return SegmentationResponse(
            success=True,
            masks=results,
            total_masks=len(results),
            image_width=w,
            image_height=h,
            message=f"Found {len(results)} objects automatically"
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error during segmentation: {str(e)}")


@app.post("/combine-masks", response_model=CombinedMaskResponse)
async def combine_masks(request: CombineMasksRequest):
    """
    Combine multiple masks using union, intersection, or difference operations.
    NOTE: Does NOT update the cache - frontend manages mask list separately.
    """
    global current_image_masks, current_image_shape
    
    if not current_image_masks:
        raise HTTPException(status_code=400, detail="No masks available. Run /segment-auto first.")
    
    mask_indices = request.mask_indices
    operation = request.operation.lower()
    
    if not mask_indices:
        raise HTTPException(status_code=400, detail="No mask indices provided")
    
    # Validate indices
    valid_indices = [i for i in mask_indices if 0 <= i < len(current_image_masks)]
    
    if not valid_indices:
        raise HTTPException(status_code=400, detail=f"No valid mask indices. Available: 0-{len(current_image_masks)-1}, requested: {mask_indices}")
    
    if operation not in ["union", "intersection", "difference"]:
        raise HTTPException(status_code=400, detail="Operation must be 'union', 'intersection', or 'difference'")
    
    try:
        h, w = current_image_shape[:2]
        
        print(f"Combining masks at indices: {valid_indices} using {operation}")
        
        if operation == "union":
            # Start with empty mask and OR all together
            combined = np.zeros((h, w), dtype=bool)
            for idx in valid_indices:
                mask_data = current_image_masks[idx]["segmentation"]
                combined = np.logical_or(combined, mask_data)
                print(f"  Added mask {idx}, area: {current_image_masks[idx]['area']}")
        elif operation == "intersection":
            combined = current_image_masks[valid_indices[0]]["segmentation"].copy().astype(bool)
            for idx in valid_indices[1:]:
                combined = np.logical_and(combined, current_image_masks[idx]["segmentation"])
        else:  # difference
            combined = current_image_masks[valid_indices[0]]["segmentation"].copy().astype(bool)
            for idx in valid_indices[1:]:
                combined = np.logical_and(combined, np.logical_not(current_image_masks[idx]["segmentation"]))
        
        # Calculate stats
        area = int(np.sum(combined))
        total_area = h * w
        coverage = (area / total_area) * 100
        
        # Convert to base64
        color = [255, 200, 0]  # Orange/Yellow for combined mask
        mask_b64 = mask_to_base64(combined, color, alpha=180)
        
        print(f"Combined {len(valid_indices)} masks. Result area: {area}")
        
        return CombinedMaskResponse(
            success=True,
            mask_base64=mask_b64,
            area=area,
            coverage_percent=float(coverage),
            source_indices=valid_indices,
            operation=operation,
            message=f"Combined {len(valid_indices)} masks using {operation}"
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error combining masks: {str(e)}")


@app.post("/smooth-mask")
async def smooth_mask(
    mask_indices: str = Form(...),
    kernel_size: int = Form(5),
    iterations: int = Form(1)
):
    """
    Apply morphological smoothing to combined masks.
    """
    global current_image_masks
    
    if not current_image_masks:
        raise HTTPException(status_code=400, detail="No masks available")
    
    try:
        indices = json.loads(mask_indices)
        
        # Combine masks first
        if len(indices) == 1:
            combined = current_image_masks[indices[0]]["segmentation"].copy()
        else:
            combined = current_image_masks[indices[0]]["segmentation"].copy()
            for idx in indices[1:]:
                combined = np.logical_or(combined, current_image_masks[idx]["segmentation"])
        
        # Apply morphological operations
        mask_uint8 = combined.astype(np.uint8)
        kernel = np.ones((kernel_size, kernel_size), np.uint8)
        
        # Close (fill holes)
        smoothed = cv2.morphologyEx(mask_uint8, cv2.MORPH_CLOSE, kernel, iterations=iterations)
        # Open (remove noise)
        smoothed = cv2.morphologyEx(smoothed, cv2.MORPH_OPEN, kernel, iterations=iterations)
        
        smoothed_bool = smoothed.astype(bool)
        
        # Stats
        area = int(np.sum(smoothed_bool))
        total_area = current_image_shape[0] * current_image_shape[1]
        coverage = (area / total_area) * 100
        
        # Convert to base64
        color = [0, 255, 128]  # Green for smoothed
        mask_b64 = mask_to_base64(smoothed_bool, color, alpha=180)
        
        return {
            "success": True,
            "mask_base64": mask_b64,
            "area": area,
            "coverage_percent": coverage,
            "kernel_size": kernel_size,
            "iterations": iterations
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error smoothing mask: {str(e)}")


@app.post("/remove-object")
async def remove_object(
    image: UploadFile = File(...),
    mask_indices: str = Form(...),
    operation: str = Form("union")
):
    """
    Remove selected objects from image (make them transparent).
    Returns the image with objects removed.
    """
    global current_image_masks
    
    if not current_image_masks:
        raise HTTPException(status_code=400, detail="No masks available")
    
    try:
        indices = json.loads(mask_indices)
        
        # Read image
        contents = await image.read()
        img = Image.open(io.BytesIO(contents)).convert("RGBA")
        img_array = np.array(img)
        
        # Combine selected masks
        combined = current_image_masks[indices[0]]["segmentation"].copy()
        for idx in indices[1:]:
            if operation == "union":
                combined = np.logical_or(combined, current_image_masks[idx]["segmentation"])
            else:
                combined = np.logical_and(combined, current_image_masks[idx]["segmentation"])
        
        # Make selected areas transparent
        img_array[combined, 3] = 0  # Set alpha to 0
        
        # Convert to base64
        result_img = Image.fromarray(img_array, mode='RGBA')
        buffer = io.BytesIO()
        result_img.save(buffer, format='PNG')
        result_b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        return {
            "success": True,
            "image_base64": result_b64,
            "removed_indices": indices,
            "message": f"Removed {len(indices)} objects"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error removing objects: {str(e)}")


@app.get("/cached-masks")
async def get_cached_masks():
    """Get info about currently cached masks"""
    if not current_image_masks:
        return {"masks": [], "count": 0}
    
    masks_info = []
    for idx, mask_data in enumerate(current_image_masks):
        masks_info.append({
            "mask_id": idx,
            "area": mask_data["area"],
            "bbox": mask_data["bbox"],
            "score": mask_data.get("stability_score", mask_data.get("predicted_iou", 0))
        })
    
    return {
        "masks": masks_info,
        "count": len(masks_info),
        "image_shape": list(current_image_shape) if current_image_shape else None
    }


if __name__ == "__main__":
    import uvicorn
    
    # Create checkpoints directory
    CHECKPOINTS_DIR.mkdir(exist_ok=True)
    
    print(f"Checkpoints directory: {CHECKPOINTS_DIR}")
    print("Download SAM model checkpoints from:")
    print("https://github.com/facebookresearch/segment-anything#model-checkpoints")
    print()
    print("Available checkpoints:")
    for model_type, checkpoint in MODEL_CHECKPOINTS.items():
        path = CHECKPOINTS_DIR / checkpoint
        status = "✓" if path.exists() else "✗"
        print(f"  {status} {model_type}: {checkpoint}")
    print()
    
    uvicorn.run(app, host="0.0.0.0", port=8000)
