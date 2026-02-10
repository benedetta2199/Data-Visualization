// User types
export interface User {
    ID: number;
    username: string;
    email: string;
    Password: string;
}

// Dataset types
export interface Dataset {
    ID: number;
    Nome: string;
}

export interface DatasetDetail {
    ID: number;
    name: string;
    datasets: SubDataset[];
}

export interface SubDataset {
    ds_name: string;
    min_value: number;
    max_value: number;
    data: DataItem[];
}

export interface DataItem {
    data_id?: number;
    description: string;
    value: number;
}

// Image types
export interface ImageRecord {
    ID: number;
    nome: string;
}

export interface SegmentedImage {
    si_ID: number;
    si_ID_ImmagineOriginale: number;
    si_nome: string;
}

export interface FinalImage {
    fi_ID: number;
    fi_nome: string;
    fi_ID_ImmagineOriginale: number;
    fi_ID_ImmagineSegmentata: number;
    fi_ID_Dataset: number;
}

// Palette types
export interface Palette {
    id: number;
    name: string;
    colors: string[];
}

export interface PaletteRecord {
    palette_id: number;
    palette_name: string;
    colors: string;
}

// Session types
export interface SessionData {
    userId?: number;
    isLoggedIn: boolean;
}

// API Response types
export interface ApiResponse {
    success?: string;
    error?: string;
}

export interface LoginResponse extends ApiResponse {
    show_form?: boolean;
}
