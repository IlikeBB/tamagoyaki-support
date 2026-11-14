import { reactive } from 'vue';

export function createUiStore() {
  return reactive({
    panelOpen: false, expeditionsOpen: false, mobileTab: 'map',
    accountPhotoFailed: false, friendCount: 0, chatUnread: 0, newsUnread:false, newsRequests:0,
    locationActive: false, locationDismissed: false,
    locationTitle: '定位分享，由你決定。', locationDetail: '預設與好友及目前小隊分享',
    connectionError: '', connectionLabel:'尚未組隊', roomDate:'', venues:[], venueName:'幕張展覽館', venueKey:'', mapProvider:'', mapZoom:null, toast: '',
  });
}
