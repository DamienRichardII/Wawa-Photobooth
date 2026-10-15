// Exécuté tôt (<head>) : marque le document « JS actif » pour que les animations de révélation ne masquent jamais le contenu sans JavaScript.
document.documentElement.classList.add('js');
if (matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.classList.add('reduce-motion');
// Lien de récupération Supabase arrivé sur une autre page du site (ex. « Site URL » par défaut) : renvoi vers la page de mot de passe.
if (/[#&](access_token|error_code)=/.test(location.hash) && /type=recovery|error_code=otp_expired|error_description=/.test(location.hash) && !location.pathname.startsWith('/admin/reset')) {
  location.replace('/admin/reset/' + location.hash);
}
