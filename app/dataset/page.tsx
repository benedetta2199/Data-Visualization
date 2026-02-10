'use client';

import { useState, useEffect } from 'react';

interface Dataset {
    ID: number;
    nome: string;
}

interface DataItem {
    description: string;
    value: number | null;
}

interface SubDataset {
    ds_name: string;
    min_value: number | null;
    max_value: number | null;
    data: DataItem[];
}

interface NewDataset {
    ID?: number;
    name: string;
    datasets: SubDataset[];
}

export default function DatasetPage() {
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [newDataset, setNewDataset] = useState<NewDataset>({
        name: '',
        datasets: [{
            ds_name: '',
            min_value: null,
            max_value: null,
            data: [{
                description: '',
                value: null
            }]
        }]
    });

    useEffect(() => {
        fetchDatasets();
    }, []);

    const fetchDatasets = async () => {
        try {
            const response = await fetch('/api/datasets');
            const data = await response.json();
            setDatasets(data);
        } catch (error) {
            console.error('Errore durante il recupero dei dataset:', error);
        }
    };

    const addDataset = () => {
        setNewDataset({
            ...newDataset,
            datasets: [...newDataset.datasets, {
                ds_name: '',
                min_value: null,
                max_value: null,
                data: [{
                    description: '',
                    value: null
                }]
            }]
        });
    };

    const removeDataset = (index: number) => {
        const updatedDatasets = [...newDataset.datasets];
        updatedDatasets.splice(index, 1);
        setNewDataset({ ...newDataset, datasets: updatedDatasets });
    };

    const addData = (datasetIndex: number) => {
        const updatedDatasets = [...newDataset.datasets];
        updatedDatasets[datasetIndex].data.push({
            description: '',
            value: null
        });
        setNewDataset({ ...newDataset, datasets: updatedDatasets });
    };

    const editDataset = async (dataset: Dataset) => {
        try {
            const response = await fetch(`/api/datasets/${dataset.ID}`);
            const data = await response.json();
            setNewDataset({
                ID: data.ID,
                name: data.name,
                datasets: data.datasets || [{
                    ds_name: '',
                    min_value: null,
                    max_value: null,
                    data: [{ description: '', value: null }]
                }]
            });
            setShowForm(true);
        } catch (error) {
            console.error('Errore durante il recupero del dataset:', error);
        }
    };

    const deleteDataset = async (dataset: Dataset) => {
        if (!confirm('Sei sicuro di voler eliminare questo dataset?')) return;

        try {
            await fetch(`/api/datasets/${dataset.ID}`, { method: 'DELETE' });
            fetchDatasets();
        } catch (error) {
            console.error('Errore durante l\'eliminazione del dataset:', error);
        }
    };

    const saveDataset = async (e: React.FormEvent) => {
        e.preventDefault();
        const endpoint = newDataset.ID ? `/api/datasets/${newDataset.ID}` : '/api/datasets';
        const method = newDataset.ID ? 'PUT' : 'POST';

        try {
            await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newDataset)
            });

            setNewDataset({
                name: '',
                datasets: [{
                    ds_name: '',
                    min_value: null,
                    max_value: null,
                    data: [{ description: '', value: null }]
                }]
            });
            fetchDatasets();
            setShowForm(false);
        } catch (error) {
            console.error('Errore durante il salvataggio del dataset:', error);
        }
    };

    const updateSubDataset = (index: number, field: keyof SubDataset, value: string | number) => {
        const updatedDatasets = [...newDataset.datasets];
        const dataset = { ...updatedDatasets[index] };
        if (field === 'ds_name') {
            dataset.ds_name = value as string;
        } else if (field === 'min_value' || field === 'max_value') {
            dataset[field] = value as number;
        }
        updatedDatasets[index] = dataset;
        setNewDataset({ ...newDataset, datasets: updatedDatasets });
    };

    const updateDataItem = (dsIndex: number, dataIndex: number, field: keyof DataItem, value: string | number) => {
        const updatedDatasets = [...newDataset.datasets];
        const dataItems = [...updatedDatasets[dsIndex].data];
        const item = { ...dataItems[dataIndex] };
        if (field === 'description') {
            item.description = value as string;
        } else if (field === 'value') {
            item.value = value as number;
        }
        dataItems[dataIndex] = item;
        updatedDatasets[dsIndex] = { ...updatedDatasets[dsIndex], data: dataItems };
        setNewDataset({ ...newDataset, datasets: updatedDatasets });
    };

    return (
        <div className="container mt-5">
            <div className="row">
                <div className="col-md-6">
                    {datasets.length > 0 ? (
                        <>
                            <h2>Lista dei Dataset</h2>
                            <ul className="list-group">
                                {datasets.map(dataset => (
                                    <li key={dataset.ID} className="list-group-item d-flex justify-content-between align-items-center">
                                        {dataset.nome}
                                        <div>
                                            <button onClick={() => editDataset(dataset)} className="btn btn-primary btn-sm me-2">
                                                Modifica
                                            </button>
                                            <button onClick={() => deleteDataset(dataset)} className="btn btn-danger btn-sm">
                                                Elimina
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : (
                        <p>Nessun dataset presente.</p>
                    )}
                </div>

                <div className="col-md-6">
                    <h2>Aggiungi Dataset</h2>
                    <button className="btn btn-primary mb-3" onClick={() => setShowForm(true)}>
                        Aggiungi nuovo dataset
                    </button>

                    {showForm && (
                        <form onSubmit={saveDataset}>
                            <div className="mb-3">
                                <label htmlFor="datasetName" className="form-label">Nome del Dataset</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    id="datasetName"
                                    value={newDataset.name}
                                    onChange={(e) => setNewDataset({ ...newDataset, name: e.target.value })}
                                    required
                                />
                            </div>

                            {newDataset.datasets.map((dataset, index) => (
                                <div key={index} className="border p-3 mb-3 rounded">
                                    <h4>Dataset {index + 1}</h4>

                                    <div className="mb-3">
                                        <label className="form-label">Nome del Dataset</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={dataset.ds_name}
                                            onChange={(e) => updateSubDataset(index, 'ds_name', e.target.value)}
                                            required
                                        />
                                    </div>

                                    <div className="row">
                                        <div className="col-md-6">
                                            <label className="form-label">Valore Minimo</label>
                                            <input
                                                type="number"
                                                className="form-control"
                                                value={dataset.min_value || ''}
                                                onChange={(e) => updateSubDataset(index, 'min_value', parseFloat(e.target.value))}
                                                required
                                            />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label">Valore Massimo</label>
                                            <input
                                                type="number"
                                                className="form-control"
                                                value={dataset.max_value || ''}
                                                onChange={(e) => updateSubDataset(index, 'max_value', parseFloat(e.target.value))}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="mb-3 mt-3">
                                        <h5>Dati</h5>
                                        {dataset.data.map((dataItem, dataIndex) => (
                                            <div key={dataIndex} className="mb-2">
                                                <label className="form-label">Descrizione</label>
                                                <input
                                                    type="text"
                                                    className="form-control mb-1"
                                                    value={dataItem.description}
                                                    onChange={(e) => updateDataItem(index, dataIndex, 'description', e.target.value)}
                                                    required
                                                />
                                                <label className="form-label">Valore</label>
                                                <input
                                                    type="number"
                                                    className="form-control"
                                                    value={dataItem.value || ''}
                                                    onChange={(e) => updateDataItem(index, dataIndex, 'value', parseFloat(e.target.value))}
                                                    required
                                                />
                                            </div>
                                        ))}
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => addData(index)}>
                                            Aggiungi Dato
                                        </button>
                                    </div>

                                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeDataset(index)}>
                                        Rimuovi Dataset
                                    </button>
                                </div>
                            ))}

                            <button type="button" className="btn btn-primary me-2" onClick={addDataset}>
                                Aggiungi Dataset
                            </button>
                            <button type="submit" className="btn btn-success">
                                Salva Dataset
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
