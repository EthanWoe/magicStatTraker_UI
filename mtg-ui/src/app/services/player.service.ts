import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type Player = Record<string, unknown>;

@Injectable({
  providedIn: 'root'
})
export class PlayerService {
  private http = inject(HttpClient);
  private readonly baseUrl = '/api';

  getAll(): Observable<Player[]> {
    return this.http.get<Player[]>(`${this.baseUrl}/player`, {
      headers: { 'Accept': 'application/json' }
    });
  }

  create(payload: Player): Observable<Player> {
    return this.http.post<Player>(`${this.baseUrl}/player`, payload, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  }

  update(playerId: number, payload: Player): Observable<Player> {
    return this.http.put<Player>(`${this.baseUrl}/player/${playerId}`, payload, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  }

  delete(playerId: number | string): Observable<void> {
    const playerKey = encodeURIComponent(String(playerId));
    return this.http.delete<void>(`${this.baseUrl}/player/${playerKey}`, {
      headers: { 'Accept': 'application/json' }
    });
  }
}
