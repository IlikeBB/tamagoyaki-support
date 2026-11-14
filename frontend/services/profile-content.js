// API route classification; content is rendered by Vue ProfileContent.
export class ProfileContentView { static managed(tab){return ['tasks','landmarks','messages'].includes(tab);} }
