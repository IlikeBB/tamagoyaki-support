'use strict';
// API route classification; content is rendered by Vue ProfileContent.
class ProfileContentView { static managed(tab){return ['tasks','landmarks','messages'].includes(tab);} }
