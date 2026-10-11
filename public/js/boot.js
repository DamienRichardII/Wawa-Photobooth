// Exécuté tôt (<head>) : marque le document « JS actif » pour que les animations de révélation ne masquent jamais le contenu sans JavaScript.
document.documentElement.classList.add('js');
if (matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.classList.add('reduce-motion');
