import Link from 'next/link';

export default function Home() {
    return (
        <div className="container mt-5">
            <div className="row justify-content-center">
                <div className="col-md-8 text-center">
                    <h1 className="display-4 mb-4">Benvenuto in Tirocinio</h1>
                    <p className="lead mb-5">
                        Applicazione per l'elaborazione di immagini con segmentazione semantica e applicazione di gradienti.
                    </p>

                    <div className="row g-4">
                        <div className="col-md-6">
                            <Link href="/dataset" className="text-decoration-none">
                                <div className="card h-100 bg-primary text-white opacity-hover">
                                    <div className="card-body p-4">
                                        <i className="bi bi-database fs-1 mb-3"></i>
                                        <h3>Dataset</h3>
                                        <p>Gestisci i dataset per l'elaborazione delle immagini</p>
                                    </div>
                                </div>
                            </Link>
                        </div>

                        <div className="col-md-6">
                            <Link href="/image" className="text-decoration-none">
                                <div className="card h-100 bg-success text-white opacity-hover">
                                    <div className="card-body p-4">
                                        <i className="bi bi-image fs-1 mb-3"></i>
                                        <h3>Genera Immagine</h3>
                                        <p>Carica e segmenta nuove immagini</p>
                                    </div>
                                </div>
                            </Link>
                        </div>

                        <div className="col-md-6">
                            <Link href="/images-list" className="text-decoration-none">
                                <div className="card h-100 bg-info text-white opacity-hover">
                                    <div className="card-body p-4">
                                        <i className="bi bi-images fs-1 mb-3"></i>
                                        <h3>Immagini</h3>
                                        <p>Visualizza e elabora le immagini salvate</p>
                                    </div>
                                </div>
                            </Link>
                        </div>

                        <div className="col-md-6">
                            <Link href="/final-images" className="text-decoration-none">
                                <div className="card h-100 bg-warning text-dark opacity-hover">
                                    <div className="card-body p-4">
                                        <i className="bi bi-check2-circle fs-1 mb-3"></i>
                                        <h3>Immagini Finali</h3>
                                        <p>Scarica le immagini elaborate</p>
                                    </div>
                                </div>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
