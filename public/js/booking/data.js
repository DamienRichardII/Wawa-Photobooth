// Textes et choix du parcours — conformes à WAWA_PHOTOBOOTH_PARCOURS_RESERVATION.md
export const EVENT_TYPES = [
  { id: 'mariage', emoji: '💍', label: 'Mariage' },
  { id: 'nikkah-hlel', emoji: '🌙', label: 'Nikkah / Hlel' },
  { id: 'fiancailles', emoji: '💐', label: 'Fiançailles' },
  { id: 'soiree-henne', emoji: '🌿', label: 'Soirée henné' },
  { id: 'baby-shower', emoji: '🍼', label: 'Baby shower' },
  { id: 'anniversaire', emoji: '🎂', label: 'Anniversaire' },
  { id: 'soiree-privee', emoji: '🥂', label: 'Soirée privée' },
  { id: 'evenement-pro', emoji: '🏢', label: 'Événement pro' },
  { id: 'autre', emoji: '✨', label: 'Autre' }
];
export const EVENT_LABEL = Object.fromEntries(EVENT_TYPES.map((e) => [e.id, e.label]));
export const COUPLE_TYPES = ['mariage', 'nikkah-hlel', 'fiancailles']; // « Soirée henné » : à valider (config.henneAskCoupleNames)
export const INSTALL_LABEL = { indoor: 'En intérieur', outdoor: 'En extérieur' };

// id, libellé du panneau latéral, libellé d'étape (en-tête), question
export const STEPS = [
  { id: 'event', side: 'Votre événement', label: 'Votre événement' },
  { id: 'place', side: 'Lieu', label: 'Lieu' },
  { id: 'photobooth', side: 'Photobooth', label: 'Photobooth' },
  { id: 'package', side: 'Formule', label: 'Formule Photobooth' },
  { id: 'magnets', side: 'Bar à magnets', label: 'Bar à magnets' },
  { id: 'details', side: 'Détails', label: 'Détails' },
  { id: 'contact', side: 'Vous', label: 'Vous' },
  { id: 'recap', side: 'Récapitulatif', label: 'Récapitulatif' }
];

export const FIELD_STEP = {
  event_type: 'event', event_type_other: 'event',
  event_address: 'place', address_place_id: 'place', installation_type: 'place',
  photobooth_requested: 'photobooth', photobooth_model: 'photobooth', photobooth_package_id: 'package', magnet_bar_requested: 'magnets',
  couple_first_names: 'details', event_date: 'details', start_time: 'details', guest_count: 'details',
  first_name: 'contact', last_name: 'contact', email: 'contact', phone: 'contact'
};
