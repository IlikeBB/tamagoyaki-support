import { effectScope, getCurrentInstance, onMounted, onScopeDispose, watch } from 'vue';
import { Resources, ownDocument } from '../runtime/resources.js';
import { useInterfaceGestures } from '../runtime/gestures.js';
import { createSessionStore } from '../stores/session.js';
import { createUiStore } from '../stores/ui.js';
import { createThemeStore } from '../stores/theme.js';
import { createGoogleMap } from '../services/google-map.js';
import { createGooglePlaces } from '../services/google-places.js';
import * as serviceTypes from '../services/index.js';
import * as TamagoVue from '../views.js';
import { createInterface } from '../features/interface.js';
import { createMapView } from '../features/map-view.js';
import { createMapGuidance } from '../features/map-guidance.js';
import { createLocation } from '../features/location.js';
import { createSession } from '../features/session.js';
import { createExpeditions } from '../features/expeditions.js';
import { createContent } from '../features/content.js';
import { createActions } from '../features/actions.js';
import { createBootstrap } from '../features/bootstrap.js';

export function useApplication() {
  const scope=effectScope(), resources=scope.run(()=>new Resources()), ui=createUiStore();
  resources.ui=ui; resources.appContext=getCurrentInstance().appContext; ownDocument(document,resources);
  const TamagoTheme=scope.run(()=>createThemeStore(resources));
  const TamagoGoogleMap=createGoogleMap(resources,TamagoTheme), TamagoGooglePlaces=createGooglePlaces(resources);
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const types={trade:'交換',bounty:'懸賞',giveaway:'配布',help:'求助',dining:'聚餐'};
const pinTypes={booth:'特典／配布',toilet:'洗手間',shop:'商店',meet:'集合點',other:'其他地標',message:'地面留言'};
const state=createSessionStore();
let map, layers, config, toastTimer, refreshing=false, lastSent=0, pollTimer;
let pinRevision=0,taskRevision=0;
const pendingPinDeletes=new Set();
let locationGeneration=0, locationWrites=Promise.resolve(), gpsPending=false, lastPositionAt=0, lastPublishedSampleAt=0;
let locationSquadId=null;
let authIntent=null;
let facilityLayer=null;
let finder=null,lastTeamSyncAt=0;
let friends=null;
let mapActions=null;
let placeSearch=null;
let assistance=null;
let appDisplay=null;
let chat=null,squadInvites=null;
let landmarkReports=null,pinFilters=null,expeditionPage=null,expeditionPreview=null,expeditionManagement=null,siteAccountAdmin=null,roomSettings=null,memberActions=null,pinReview=null,blockedPeople=null,roomAdmission=null;
let profilePage=null,landmarkFeedback=null,taskFeedback=null,news=null,chatFriend=null,groundMessages=null;
let locationCardDismissed=false;
let centerOnLocationFix=true;
let visibleTeammateKey='';
  const app={resources,ui,scope,TamagoVue,TamagoTheme,TamagoGoogleMap,TamagoGooglePlaces,...serviceTypes,
    get $(){return $;},
    get $$(){return $$;},
    get types(){return types;},
    get pinTypes(){return pinTypes;},
    get state(){return state;},
    get map(){return map;}, set map(value){map=value;},
    get layers(){return layers;}, set layers(value){layers=value;},
    get config(){return config;}, set config(value){config=value;},
    get toastTimer(){return toastTimer;}, set toastTimer(value){toastTimer=value;},
    get refreshing(){return refreshing;}, set refreshing(value){refreshing=value;},
    get lastSent(){return lastSent;}, set lastSent(value){lastSent=value;},
    get pollTimer(){return pollTimer;}, set pollTimer(value){pollTimer=value;},
    get pinRevision(){return pinRevision;}, set pinRevision(value){pinRevision=value;},
    get taskRevision(){return taskRevision;}, set taskRevision(value){taskRevision=value;},
    get pendingPinDeletes(){return pendingPinDeletes;},
    get locationGeneration(){return locationGeneration;}, set locationGeneration(value){locationGeneration=value;},
    get locationWrites(){return locationWrites;}, set locationWrites(value){locationWrites=value;},
    get gpsPending(){return gpsPending;}, set gpsPending(value){gpsPending=value;},
    get lastPositionAt(){return lastPositionAt;}, set lastPositionAt(value){lastPositionAt=value;},
    get lastPublishedSampleAt(){return lastPublishedSampleAt;}, set lastPublishedSampleAt(value){lastPublishedSampleAt=value;},
    get locationSquadId(){return locationSquadId;}, set locationSquadId(value){locationSquadId=value;},
    get authIntent(){return authIntent;}, set authIntent(value){authIntent=value;},
    get facilityLayer(){return facilityLayer;}, set facilityLayer(value){facilityLayer=value;},
    get finder(){return finder;}, set finder(value){finder=value;},
    get lastTeamSyncAt(){return lastTeamSyncAt;}, set lastTeamSyncAt(value){lastTeamSyncAt=value;},
    get friends(){return friends;}, set friends(value){friends=value;},
    get mapActions(){return mapActions;}, set mapActions(value){mapActions=value;},
    get placeSearch(){return placeSearch;}, set placeSearch(value){placeSearch=value;},
    get assistance(){return assistance;}, set assistance(value){assistance=value;},
    get appDisplay(){return appDisplay;}, set appDisplay(value){appDisplay=value;},
    get chat(){return chat;}, set chat(value){chat=value;},
    get squadInvites(){return squadInvites;}, set squadInvites(value){squadInvites=value;},
    get landmarkReports(){return landmarkReports;}, set landmarkReports(value){landmarkReports=value;},
    get pinFilters(){return pinFilters;}, set pinFilters(value){pinFilters=value;},
    get expeditionPage(){return expeditionPage;}, set expeditionPage(value){expeditionPage=value;},
    get expeditionPreview(){return expeditionPreview;}, set expeditionPreview(value){expeditionPreview=value;},
    get expeditionManagement(){return expeditionManagement;}, set expeditionManagement(value){expeditionManagement=value;},
    get siteAccountAdmin(){return siteAccountAdmin;}, set siteAccountAdmin(value){siteAccountAdmin=value;},
    get roomSettings(){return roomSettings;}, set roomSettings(value){roomSettings=value;},
    get memberActions(){return memberActions;}, set memberActions(value){memberActions=value;},
    get pinReview(){return pinReview;}, set pinReview(value){pinReview=value;},
    get blockedPeople(){return blockedPeople;}, set blockedPeople(value){blockedPeople=value;},
    get roomAdmission(){return roomAdmission;}, set roomAdmission(value){roomAdmission=value;},
    get profilePage(){return profilePage;}, set profilePage(value){profilePage=value;},
    get landmarkFeedback(){return landmarkFeedback;}, set landmarkFeedback(value){landmarkFeedback=value;},
    get taskFeedback(){return taskFeedback;}, set taskFeedback(value){taskFeedback=value;},
    get news(){return news;}, set news(value){news=value;},
    get chatFriend(){return chatFriend;}, set chatFriend(value){chatFriend=value;},
    get groundMessages(){return groundMessages;}, set groundMessages(value){groundMessages=value;},
    get locationCardDismissed(){return locationCardDismissed;}, set locationCardDismissed(value){locationCardDismissed=value;},
    get centerOnLocationFix(){return centerOnLocationFix;}, set centerOnLocationFix(value){centerOnLocationFix=value;},
    get visibleTeammateKey(){return visibleTeammateKey;}, set visibleTeammateKey(value){visibleTeammateKey=value;}
  };
  Object.assign(app, createInterface(app));
  Object.assign(app, createMapView(app));
  Object.assign(app, createMapGuidance(app));
  Object.assign(app, createLocation(app));
  Object.assign(app, createSession(app));
  Object.assign(app, createExpeditions(app));
  Object.assign(app, createContent(app));
  Object.assign(app, createActions(app));
  Object.assign(app, createBootstrap(app));

  resources.defer(()=>{ locationGeneration++; lastTeamSyncAt=0; if(assistance){assistance.generation++;assistance.suspended=true;} facilityLayer?.remove();layers?.clearLayers();if(map?.isGoogle)map.destroy();else map?.remove();map=null; });
  onMounted(()=>scope.run(()=>{
    useInterfaceGestures(resources);
resources.listen(window, 'hashchange',()=>{if(!config)return;if(app.expeditionRoute()&&!expeditionPage?.visible())app.showExpeditionPage({route:false});else if(!app.expeditionRoute()&&expeditionPage?.visible()){app.closeDialog();app.showMap();}});
resources.listen(window, 'popstate',()=>{if(!config)return;if(app.expeditionRoute()&&!expeditionPage?.visible())app.showExpeditionPage({route:false});else if(!app.expeditionRoute()&&expeditionPage?.visible()){app.closeDialog();app.showMap();}});
resources.listen(window, 'tamago-theme-change',()=>map?.setTheme?.());
resources.listen($('#dialog'), 'click',e=>{if(e.target===$('#dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)app.closeDialog();}});
resources.listen(document, 'visibilitychange',()=>{lastTeamSyncAt=0;if(friends)friends.syncedAt=0;app.renderMap();if(!document.hidden)app.resumeLocation();});
resources.listen(window, 'pageshow',app.resumeLocation);
resources.listen(window, 'online',()=>{app.refresh();friends?.sync();});
resources.listen(window, 'offline',()=>{state.online=false;state.members=state.members.map(m=>({...m,lat:null,lng:null}));app.render();});
resources.listen(window, 'tamago-google-auth-failure',async()=>{
  if(!map?.isGoogle)return;
  placeSearch?.clear();
  facilityLayer?.remove();facilityLayer=null;layers.clearLayers();map.destroy();map=null;
  await app.initMap(true);app.renderMap();
});
    watch(()=>[state.authenticated,state.user,state.room,state.rooms,state.members,state.tasks,state.pins,state.squads,state.mine,state.tab,state.filter,state.query],()=>{if(resources.active&&config&&state.room&&friends)app.render();});
    app.init();
  }));
  onScopeDispose(()=>scope.stop());
  return app;
}
