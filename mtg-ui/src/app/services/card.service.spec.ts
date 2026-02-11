import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DecksComponent } from '../features/decks/decks.component';

describe('DecksComponent', () => {
  let component: DecksComponent;
  let fixture: ComponentFixture<DecksComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DecksComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DecksComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
