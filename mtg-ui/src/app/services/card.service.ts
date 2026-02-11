import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Card } from '../shared/models/card.model';

@Injectable({
  providedIn: 'root',
})
export class CardService {
  private baseUrl = '/api/card';

  constructor(private http: HttpClient) {}

  getAll(): Observable<Card[]> {
    return this.http.get<Card[]>(`${this.baseUrl}`);
  }

  getOne(cardNumber: number, setName: string): Observable<Card> {
    return this.http.get<Card>(`${this.baseUrl}/${cardNumber}/${setName}`);
  }

  search(query: string): Observable<Card[]> {
    return this.http.get<Card[]>(`${this.baseUrl}/search?q=${query}`);
  }

  create(card: Card): Observable<Card> {
    return this.http.post<Card>(`${this.baseUrl}`, card);
  }

  update(cardNumber: number, setName: string, dto: Partial<Card>): Observable<Card> {
    return this.http.put<Card>(`${this.baseUrl}/${cardNumber}/${setName}`, dto);
  }

  delete(cardNumber: number, setName: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${cardNumber}/${setName}`);
  }
}
