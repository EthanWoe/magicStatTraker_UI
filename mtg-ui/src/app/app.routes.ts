import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'decks',
    loadComponent: () =>
      import('./features/decks/decks.component')
        .then(m => m.DecksComponent)
  },

  {
    path: 'players',
    loadComponent: () =>
      import('./features/players/players.component')
        .then(m => m.PlayersComponent)
  },

  {
    path: 'create-game',
    loadComponent: () =>
      import('./features/create-game/create-game.component')
        .then(m => m.CreateGameComponent)
  },

  {
    path: 'match-history',
    loadComponent: () =>
      import('./features/match-history/match-history.component')
        .then(m => m.MatchHistoryComponent)
  },

  { path: '', pathMatch: 'full', redirectTo: 'decks' }
];
