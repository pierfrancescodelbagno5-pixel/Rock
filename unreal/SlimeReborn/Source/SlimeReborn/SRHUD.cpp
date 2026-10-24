#include "SRHUD.h"
#include "SlimeCharacter.h"
#include "SRGameMode.h"
#include "SREnemy.h"
#include "SRWorld.h"
#include "SRDungeon.h"
#include "SRCompanion.h"
#include "SRTypes.h"
#include "Engine/Canvas.h"
#include "Engine/Font.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "EngineUtils.h"

namespace
{
	const FLinearColor HudGold(1.f, 0.8f, 0.35f);
	const FLinearColor HudCyan(0.45f, 0.85f, 1.f);
	const FLinearColor HudDim(0.75f, 0.75f, 0.78f);
}

UFont* ASRHUD::Font() const
{
	return GEngine ? GEngine->GetLargeFont() : nullptr;
}

// ============================================================================
// Primitives
// ============================================================================

void ASRHUD::Panel(float X, float Y, float W, float H, const FLinearColor& C)
{
	DrawRect(C, X, Y, W, H);
}

void ASRHUD::Frame(float X, float Y, float W, float H, const FLinearColor& C, float T)
{
	DrawLine(X, Y, X + W, Y, C, T);
	DrawLine(X, Y + H, X + W, Y + H, C, T);
	DrawLine(X, Y, X, Y + H, C, T);
	DrawLine(X + W, Y, X + W, Y + H, C, T);
}

void ASRHUD::Bar(float X, float Y, float W, float H, float Pct, const FLinearColor& Fill, const FLinearColor& Back)
{
	Pct = FMath::Clamp(Pct, 0.f, 1.f);
	DrawRect(Back, X - 2.f, Y - 2.f, W + 4.f, H + 4.f);
	DrawRect(Fill * 0.55f, X, Y, W * Pct, H);
	DrawRect(Fill, X, Y, W * Pct, H * 0.6f);
	DrawRect(FLinearColor(1.f, 1.f, 1.f, 0.12f), X, Y, W * Pct, FMath::Max(1.f, H * 0.18f));
}

float ASRHUD::TxtW(const FString& S, float SizePx)
{
	float W = 0.f, H = 0.f;
	GetTextSize(S, W, H, Font(), SizePx * UI / FMath::Max(1.f, FontBase));
	return W;
}

void ASRHUD::Txt(const FString& S, float X, float Y, const FLinearColor& C, float SizePx, bool bCenter, bool bShadow)
{
	if (S.IsEmpty()) return;
	const float Scale = SizePx * UI / FMath::Max(1.f, FontBase);
	if (bCenter) X -= TxtW(S, SizePx) * 0.5f;
	if (bShadow) DrawText(S, FLinearColor(0.f, 0.f, 0.f, C.A * 0.85f), X + 2.f * UI, Y + 2.f * UI, Font(), Scale);
	DrawText(S, C, X, Y, Font(), Scale);
}

TArray<FString> ASRHUD::Wrap(const FString& S, float MaxW, float SizePx)
{
	TArray<FString> Lines;
	TArray<FString> Words;
	S.ParseIntoArray(Words, TEXT(" "), true);
	FString Cur;
	for (const FString& W : Words)
	{
		const FString Try = Cur.IsEmpty() ? W : Cur + TEXT(" ") + W;
		if (!Cur.IsEmpty() && TxtW(Try, SizePx) > MaxW)
		{
			Lines.Add(Cur);
			Cur = W;
		}
		else
		{
			Cur = Try;
		}
	}
	if (!Cur.IsEmpty()) Lines.Add(Cur);
	return Lines;
}

bool ASRHUD::ToScreen(const FVector& World, FVector2D& Out) const
{
	return PlayerOwner && PlayerOwner->ProjectWorldLocationToScreen(World, Out, false);
}

// ============================================================================
// Public API
// ============================================================================

void ASRHUD::PushOracle(const FString& Text)
{
	FOracleLine L;
	L.Text = Text;
	Oracle.Add(L);
	if (Oracle.Num() > 5) Oracle.RemoveAt(0);
}

void ASRHUD::ShowToast(const FString& Big, const FString& Small)
{
	ToastBig = Big;
	ToastSmall = Small;
	ToastAge = 0.f;
}

void ASRHUD::DamageNumber(const FVector& At, float Amount, const FLinearColor& Color, const FString& Prefix)
{
	FDmgNumber N;
	N.At = At;
	N.Color = Color;
	N.DriftX = FMath::FRandRange(-30.f, 30.f);
	if (Amount <= 0.f) N.Text = Prefix;
	else N.Text = Prefix + FString::FromInt(FMath::RoundToInt(Amount));
	N.Size = Prefix == TEXT("!") ? 44.f : 30.f;
	Numbers.Add(N);
	if (Numbers.Num() > 40) Numbers.RemoveAt(0);
}

// ============================================================================
// Main draw
// ============================================================================

void ASRHUD::DrawHUD()
{
	Super::DrawHUD();
	if (!Canvas || !GetWorld()) return;

	const float Now = GetWorld()->GetRealTimeSeconds();
	const float Dt = LastTime < 0.f ? 0.f : FMath::Clamp(Now - LastTime, 0.f, 0.1f);
	LastTime = Now;
	Time += Dt;
	UI = Canvas->ClipY / 1080.f;
	if (FontBase <= 0.f)
	{
		float W = 0.f, H = 0.f;
		GetTextSize(TEXT("Ag"), W, H, Font(), 1.f);
		FontBase = H > 0.f ? H : 24.f;
	}

	ASlimeCharacter* P = Cast<ASlimeCharacter>(GetOwningPawn());
	ASRGameMode* GM = GetWorld()->GetAuthGameMode<ASRGameMode>();
	if (GM && GM->bInMenu)
	{
		DrawMenu(GM);
		return;
	}
	if (!P) return;

	// Low health vignette
	if (P->HP < P->MaxHP * 0.3f && !P->bDead)
	{
		const float A = 0.18f + 0.12f * FMath::Sin(Time * 6.f);
		const float W = Canvas->ClipX, H = Canvas->ClipY, E = 90.f * UI;
		Panel(0, 0, W, E, FLinearColor(0.6f, 0.f, 0.f, A));
		Panel(0, H - E, W, E, FLinearColor(0.6f, 0.f, 0.f, A));
		Panel(0, E, E, H - 2 * E, FLinearColor(0.6f, 0.f, 0.f, A));
		Panel(W - E, E, E, H - 2 * E, FLinearColor(0.6f, 0.f, 0.f, A));
	}

	DrawWorldMarkers(P);
	DrawDamage(Dt);
	DrawStatus(P);
	DrawCompass(P, GM);
	DrawQuest(P, GM);
	DrawSkillBar(P);
	DrawBoss(GM);
	DrawPrompt(P);
	DrawDialog(P);
	DrawOracle(Dt);
	DrawToast(Dt);
	DrawKeyHints();
	DrawParty(P, GM);
	if (P->bShowInventory) DrawInventory(P);
	if (P->bGraceMenu) DrawGraceMenu(P);
	if (P->bShowHelp) DrawHelp();
	if (P->bDead) DrawDeath(P);
}

// ============================================================================
// Title menu
// ============================================================================

void ASRHUD::DrawMenu(ASRGameMode* GM)
{
	const float W = Canvas->ClipX, H = Canvas->ClipY;
	Panel(0, 0, W, H, FLinearColor(0.f, 0.f, 0.02f, 0.35f));
	Panel(0, 0, W, 200.f * UI, FLinearColor(0.f, 0.f, 0.f, 0.5f));
	Panel(0, H - 140.f * UI, W, 140.f * UI, FLinearColor(0.f, 0.f, 0.f, 0.6f));

	const float Pulse = 0.85f + 0.15f * FMath::Sin(Time * 2.f);
	Txt(TEXT("SLIME REBORN"), W * 0.5f, 40.f * UI, FLinearColor(0.55f, 0.85f, 1.f, Pulse), 92.f, true);
	Txt(TEXT("TERRE SPEZZATE  -  Unreal Engine 5"), W * 0.5f, 150.f * UI, HudGold, 26.f, true);

	const int32 NC = SR::NumClasses;
	const float Gap = 22.f * UI;
	const float CardW = FMath::Min(340.f * UI, (W - 60.f * UI - Gap * (NC - 1)) / NC), CardH = 450.f * UI;
	const float Total = CardW * NC + Gap * (NC - 1);
	const float X0 = (W - Total) * 0.5f, Y0 = H * 0.5f - CardH * 0.5f + 20.f * UI;
	for (int32 i = 0; i < NC; ++i)
	{
		const ESRClass Cls = SR::ClassAt(i);
		const FSRClassInfo& C = SR::Class(Cls);
		const bool bSel = GM->MenuClass == static_cast<int32>(Cls);
		const float X = X0 + i * (CardW + Gap);
		const float Y = Y0 - (bSel ? 14.f * UI : 0.f);
		Panel(X, Y, CardW, CardH, bSel ? FLinearColor(0.08f, 0.06f, 0.02f, 0.88f) : FLinearColor(0.f, 0.f, 0.f, 0.7f));
		Frame(X, Y, CardW, CardH, bSel ? HudGold : FLinearColor(1.f, 1.f, 1.f, 0.25f), bSel ? 3.f : 1.f);
		const bool bMythic = Cls == ESRClass::Emperor;
		Txt(FString::Printf(TEXT("[%d]"), i + 1), X + 18.f * UI, Y + 14.f * UI, HudDim, 20.f);
		if (bMythic) Txt(TEXT("MITICA"), X + CardW - 110.f * UI, Y + 14.f * UI, FLinearColor(1.f, 0.35f, 0.9f), 20.f);
		Txt(C.Name, X + 18.f * UI, Y + 50.f * UI, bMythic ? FLinearColor(1.f, 0.6f, 1.f) : (bSel ? HudGold : FLinearColor::White), bMythic ? 24.f : 28.f);
		Txt(C.Title, X + 18.f * UI, Y + 92.f * UI, HudCyan, 21.f);
		float LY = Y + 140.f * UI;
		for (const FString& L : Wrap(C.Desc, CardW - 36.f * UI, 20.f))
		{
			Txt(L, X + 18.f * UI, LY, HudDim, 20.f);
			LY += 26.f * UI;
		}
		const float SY = Y + CardH - 120.f * UI;
		const float MaxV = 420.f;
		Txt(TEXT("Vita"), X + 18.f * UI, SY, HudDim, 18.f);
		Bar(X + 110.f * UI, SY + 6.f * UI, CardW - 140.f * UI, 10.f * UI, C.HP / MaxV, FLinearColor(0.85f, 0.15f, 0.15f));
		Txt(TEXT("Mana"), X + 18.f * UI, SY + 30.f * UI, HudDim, 18.f);
		Bar(X + 110.f * UI, SY + 36.f * UI, CardW - 140.f * UI, 10.f * UI, C.MP / MaxV, FLinearColor(0.2f, 0.45f, 1.f));
		Txt(TEXT("Attacco"), X + 18.f * UI, SY + 60.f * UI, HudDim, 18.f);
		Bar(X + 110.f * UI, SY + 66.f * UI, CardW - 140.f * UI, 10.f * UI, C.Atk / 36.f, HudGold);
		if (C.bPredator) Txt(TEXT("Predatore  -  Mimetismo"), X + 18.f * UI, SY + 88.f * UI, FLinearColor(0.4f, 0.9f, 1.f), 17.f);
	}

	FString Hint = TEXT("[1-5] Scegli classe     [INVIO] Nuova partita");
	if (GM->bHasSave) Hint += TEXT("     [C] Continua");
	Txt(Hint, W * 0.5f, H - 105.f * UI, FLinearColor::White, 26.f, true);
	Txt(TEXT("Gamepad:  D-pad cambia classe   -   A inizia"), W * 0.5f, H - 62.f * UI, HudDim, 19.f, true);
}

// ============================================================================
// Status
// ============================================================================

void ASRHUD::DrawStatus(ASlimeCharacter* P)
{
	const float X = 28.f * UI, Y = 26.f * UI;
	static const TCHAR* Forms[] = { TEXT("Slime"), TEXT("Umano"), TEXT("Lupo Tempesta") };
	Panel(X - 12.f * UI, Y - 10.f * UI, 470.f * UI, 158.f * UI, FLinearColor(0.f, 0.f, 0.f, 0.4f));
	Txt(FString::Printf(TEXT("%s   Lv.%d"), SR::Class(P->ClassId).Name, P->Level), X, Y, FLinearColor::White, 24.f);
	Txt(FString::Printf(TEXT("Forma: %s"), Forms[static_cast<int32>(P->Form)]), X + 300.f * UI, Y + 4.f * UI, HudCyan, 17.f);

	const float BW = 430.f * UI;
	Bar(X, Y + 38.f * UI, BW, 16.f * UI, P->HP / FMath::Max(1.f, P->MaxHP), FLinearColor(0.85f, 0.12f, 0.12f));
	Txt(FString::Printf(TEXT("%d / %d"), FMath::RoundToInt(P->HP), FMath::RoundToInt(P->MaxHP)), X + 8.f * UI, Y + 36.f * UI, FLinearColor::White, 15.f);
	Bar(X, Y + 62.f * UI, BW * 0.85f, 11.f * UI, P->MP / FMath::Max(1.f, P->MaxMP), FLinearColor(0.2f, 0.45f, 1.f));
	Bar(X, Y + 81.f * UI, BW * 0.7f, 8.f * UI, P->Stamina / FMath::Max(1.f, P->MaxStamina), FLinearColor(0.3f, 0.85f, 0.35f));
	Bar(X, Y + 97.f * UI, BW, 4.f * UI, P->XP / SR::XPForLevel(P->Level), HudGold);
	Txt(FString::Printf(TEXT("Oro %d     Pozioni %d     Arma +%d     Prede %d"), P->Gold, P->Potions, P->WeaponLevel, P->Absorbed), X, Y + 110.f * UI, HudGold, 17.f);
}

void ASRHUD::DrawSkillBar(ASlimeCharacter* P)
{
	const float W = Canvas->ClipX, H = Canvas->ClipY;
	const int32 N = P->Skills.Num();
	const float S = 64.f * UI, Gap = 10.f * UI;
	const float Total = N * S + FMath::Max(0, N - 1) * Gap;
	const float X0 = W * 0.5f - Total * 0.5f, Y = H - S - 34.f * UI;
	for (int32 i = 0; i < N; ++i)
	{
		const ESRSkill K = P->Skills[i];
		const FSRSkillInfo& Info = SR::Skill(K);
		const float X = X0 + i * (S + Gap);
		const bool bSel = i == P->SelectedSkill;
		Panel(X, Y, S, S, FLinearColor(0.f, 0.f, 0.f, 0.65f));
		DrawRect(FLinearColor(Info.Color.R * 0.3f, Info.Color.G * 0.3f, Info.Color.B * 0.3f, 0.6f), X + 6.f * UI, Y + 6.f * UI, S - 12.f * UI, S - 12.f * UI);
		DrawRect(FLinearColor(Info.Color.R, Info.Color.G, Info.Color.B, 0.85f), X + 14.f * UI, Y + 14.f * UI, S - 28.f * UI, S - 28.f * UI);
		const float CD = P->Cooldowns[static_cast<int32>(K)];
		if (CD > 0.f)
		{
			const float Frac = FMath::Clamp(CD / FMath::Max(0.1f, Info.Cooldown), 0.f, 1.f);
			Panel(X, Y + S * (1.f - Frac), S, S * Frac, FLinearColor(0.f, 0.f, 0.f, 0.7f));
			Txt(FString::Printf(TEXT("%.1f"), CD), X + S * 0.5f, Y + S * 0.3f, FLinearColor::White, 18.f, true);
		}
		if (P->MP < Info.Mana) Panel(X, Y, S, S, FLinearColor(0.f, 0.f, 0.3f, 0.45f));
		Frame(X, Y, S, S, bSel ? HudGold : FLinearColor(1.f, 1.f, 1.f, 0.3f), bSel ? 3.f : 1.f);
		Txt(FString::FromInt(i + 1), X + 4.f * UI, Y + 2.f * UI, FLinearColor::White, 15.f);
		Txt(FString::FromInt(FMath::RoundToInt(Info.Mana)), X + S - 24.f * UI, Y + S - 22.f * UI, HudCyan, 14.f);
	}
	if (P->Skills.IsValidIndex(P->SelectedSkill))
	{
		const FSRSkillInfo& Info = SR::Skill(P->Skills[P->SelectedSkill]);
		Txt(FString::Printf(TEXT("[R] %s"), Info.Name), W * 0.5f, Y - 34.f * UI, FLinearColor::White, 22.f, true);
	}
	// Potion & form boxes
	const float BX = X0 - 2.f * (S + Gap) - 10.f * UI;
	Panel(BX, Y, S, S, FLinearColor(0.f, 0.f, 0.f, 0.65f));
	DrawRect(FLinearColor(0.85f, 0.15f, 0.2f, 0.85f), BX + 20.f * UI, Y + 14.f * UI, S - 40.f * UI, S - 26.f * UI);
	Frame(BX, Y, S, S, FLinearColor(1.f, 1.f, 1.f, 0.3f));
	Txt(TEXT("H"), BX + 4.f * UI, Y + 2.f * UI, FLinearColor::White, 15.f);
	Txt(FString::FromInt(P->Potions), BX + S - 20.f * UI, Y + S - 24.f * UI, FLinearColor::White, 17.f);
	if (P->CanTransform())
	{
		const float FX = BX + S + Gap;
		Panel(FX, Y, S, S, FLinearColor(0.f, 0.f, 0.f, 0.65f));
		static const TCHAR* Short[] = { TEXT("SLM"), TEXT("UMN"), TEXT("LUP") };
		Txt(Short[static_cast<int32>(P->Form)], FX + S * 0.5f, Y + S * 0.32f, HudCyan, 17.f, true);
		Frame(FX, Y, S, S, FLinearColor(0.4f, 0.8f, 1.f, 0.5f));
		Txt(TEXT("G"), FX + 4.f * UI, Y + 2.f * UI, FLinearColor::White, 15.f);
	}
}

// ============================================================================
// Compass, time & quest
// ============================================================================

void ASRHUD::DrawCompass(ASlimeCharacter* P, ASRGameMode* GM)
{
	const float W = Canvas->ClipX;
	const float CW = 640.f * UI, CX = W * 0.5f, Y = 26.f * UI, CH = 34.f * UI;
	Panel(CX - CW * 0.5f, Y, CW, CH, FLinearColor(0.f, 0.f, 0.f, 0.45f));
	const float Yaw = PlayerOwner ? PlayerOwner->GetControlRotation().Yaw : P->GetActorRotation().Yaw;
	auto Place = [&](float Heading, float& OutX) -> bool
	{
		const float Rel = FMath::FindDeltaAngleDegrees(Yaw, Heading);
		if (FMath::Abs(Rel) > 90.f) return false;
		OutX = CX + Rel / 90.f * CW * 0.5f;
		return true;
	};
	static const TCHAR* Card[] = { TEXT("N"), TEXT("NE"), TEXT("E"), TEXT("SE"), TEXT("S"), TEXT("SO"), TEXT("O"), TEXT("NO") };
	for (int32 i = 0; i < 24; ++i)
	{
		float X;
		if (!Place(i * 15.f, X)) continue;
		if (i % 3 == 0)
		{
			const bool bMain = (i % 6) == 0;
			Txt(Card[i / 3], X, Y + 4.f * UI, i == 0 ? FLinearColor(1.f, 0.35f, 0.3f) : FLinearColor::White, bMain ? 22.f : 16.f, true);
		}
		else
		{
			DrawLine(X, Y + CH - 10.f * UI, X, Y + CH - 2.f * UI, FLinearColor(1.f, 1.f, 1.f, 0.5f), 1.f);
		}
	}
	const FVector Me = P->GetActorLocation();
	auto Marker = [&](const FVector& Target, const FLinearColor& C, float Size)
	{
		const FVector D = Target - Me;
		float X;
		if (!Place(FMath::RadiansToDegrees(FMath::Atan2(D.Y, D.X)), X)) return;
		DrawRect(C, X - Size * 0.5f * UI, Y + CH - 2.f * UI, Size * UI, Size * UI);
	};
	// Discovered graces
	const TArray<FSRGrace>& G = SR::Graces();
	for (int32 i = 0; i < G.Num(); ++i)
	{
		if (P->GraceFound.IsValidIndex(i) && P->GraceFound[i]) Marker(G[i].Location, FLinearColor(1.f, 0.85f, 0.45f, 0.7f), 7.f);
	}
	// Quest target
	if (GM)
	{
		if (const FSRQuest* Q = GM->ActiveQuest())
		{
			if (GM->QuestProgress >= Q->Need) Marker(ASRGameMode::GuildSpot, HudGold, 14.f);
			else if (SR::Zones().IsValidIndex(Q->Zone))
			{
				const FVector2D C = SR::Zones()[Q->Zone].Center;
				Marker(FVector(C.X, C.Y, 0.f), HudGold, 14.f);
			}
		}
		else
		{
			Marker(ASRGameMode::GuildSpot, FLinearColor(0.6f, 0.9f, 1.f), 10.f);
		}
	}

	// Clock & region
	if (P->bInDungeon && GM && GM->Dungeon)
	{
		const FString Info = GM->Dungeon->IsCleared()
			? FString::Printf(TEXT("Torre dei Mille Piani  -  Piano %d  -  portale aperto!"), GM->Dungeon->Floor)
			: FString::Printf(TEXT("Torre dei Mille Piani  -  Piano %d  -  nemici rimasti: %d"), GM->Dungeon->Floor, GM->Dungeon->EnemiesLeft());
		Txt(Info, CX, Y + CH + 6.f * UI, HudGold, 18.f, true);
	}
	else if (GM && GM->GetSRWorld())
	{
		const float T = GM->GetSRWorld()->TimeOfDay;
		const int32 Hh = FMath::FloorToInt(T), Mm = FMath::FloorToInt((T - Hh) * 60.f);
		const FString Clock = FString::Printf(TEXT("%s  %02d:%02d   -   %s"), GM->GetSRWorld()->IsNight() ? TEXT("Notte") : TEXT("Giorno"), Hh, Mm, *SR::RegionName(Me));
		Txt(Clock, CX, Y + CH + 6.f * UI, HudDim, 17.f, true);
	}
}

void ASRHUD::DrawQuest(ASlimeCharacter* P, ASRGameMode* GM)
{
	if (!GM) return;
	const float W = Canvas->ClipX;
	const float PW = 420.f * UI, X = W - PW - 28.f * UI, Y = 26.f * UI;
	Panel(X - 12.f * UI, Y - 8.f * UI, PW + 24.f * UI, 120.f * UI, FLinearColor(0.f, 0.f, 0.f, 0.4f));
	Txt(TEXT("MISSIONE"), X, Y, HudGold, 18.f);
	if (const FSRQuest* Q = GM->ActiveQuest())
	{
		Txt(Q->Title, X, Y + 26.f * UI, FLinearColor::White, 22.f);
		const bool bDone = GM->QuestProgress >= Q->Need;
		Txt(bDone ? FString(TEXT("Completata! Torna da Brann alla Gilda."))
			: FString::Printf(TEXT("%s: %d / %d"), SR::Enemy(Q->Target).Name, GM->QuestProgress, Q->Need),
			X, Y + 56.f * UI, bDone ? FLinearColor(0.5f, 1.f, 0.5f) : HudDim, 18.f);
		if (!bDone && SR::Zones().IsValidIndex(Q->Zone))
		{
			const FVector2D C = SR::Zones()[Q->Zone].Center;
			const float D = FVector::Dist2D(P->GetActorLocation(), FVector(C.X, C.Y, 0.f)) / 100.f;
			Txt(FString::Printf(TEXT("%s  -  %d m"), *SR::Zones()[Q->Zone].Name, FMath::RoundToInt(D)), X, Y + 82.f * UI, HudGold, 16.f);
		}
	}
	else if (SR::Quests().IsValidIndex(GM->QuestIndex))
	{
		Txt(TEXT("Parla con Brann alla Gilda"), X, Y + 26.f * UI, FLinearColor::White, 21.f);
		Txt(TEXT("(sud-ovest della fontana di Altheria)"), X, Y + 56.f * UI, HudDim, 17.f);
	}
	else
	{
		Txt(TEXT("Tutte le missioni completate!"), X, Y + 26.f * UI, FLinearColor(0.5f, 1.f, 0.5f), 21.f);
	}
}

// ============================================================================
// World-space markers
// ============================================================================

void ASRHUD::DrawWorldMarkers(ASlimeCharacter* P)
{
	const FVector Me = P->GetActorLocation();
	const float Now = GetWorld()->GetTimeSeconds();
	for (TActorIterator<ASREnemy> It(GetWorld()); It; ++It)
	{
		ASREnemy* E = *It;
		const float D = FVector::Dist(E->GetActorLocation(), Me);
		FVector2D S;
		if (E->CanBeAbsorbed())
		{
			if (D < 2500.f && ToScreen(E->GetActorLocation() + FVector(0, 0, 60.f), S))
			{
				const float Bob = FMath::Sin(Time * 4.f) * 4.f * UI;
				DrawRect(FLinearColor(0.3f, 0.8f, 1.f, 0.85f), S.X - 6.f * UI, S.Y - 6.f * UI + Bob, 12.f * UI, 12.f * UI);
				if (D < 600.f) Txt(P->IsPredator() ? TEXT("E  Predazione") : TEXT("E  Saccheggia"), S.X, S.Y - 34.f * UI, HudCyan, 16.f, true);
			}
			continue;
		}
		if (E->IsDead() || E->bBoss) continue;
		const bool bShow = D < 3600.f && (E->IsEngaged() || Now - E->LastHitTime < 6.f || P->LockTarget.Get() == E);
		if (!bShow || !ToScreen(E->GetHeadLocation(), S)) continue;
		const float BW = 120.f * UI;
		Bar(S.X - BW * 0.5f, S.Y, BW, 7.f * UI, E->HP / FMath::Max(1.f, E->MaxHP), FLinearColor(0.85f, 0.15f, 0.12f));
		const int32 Diff = E->Level - P->Level;
		const FLinearColor LC = Diff >= 5 ? FLinearColor(1.f, 0.3f, 0.3f) : (Diff >= 2 ? FLinearColor(1.f, 0.75f, 0.3f) : FLinearColor::White);
		Txt(E->DisplayName(), S.X, S.Y - 24.f * UI, LC, 16.f, true);
	}

	if (P->LockTarget.IsValid())
	{
		FVector2D S;
		if (ToScreen(P->LockTarget->GetActorLocation(), S))
		{
			const float R = (14.f + 3.f * FMath::Sin(Time * 6.f)) * UI;
			const FLinearColor C(1.f, 0.9f, 0.6f);
			DrawLine(S.X, S.Y - R, S.X + R, S.Y, C, 2.f);
			DrawLine(S.X + R, S.Y, S.X, S.Y + R, C, 2.f);
			DrawLine(S.X, S.Y + R, S.X - R, S.Y, C, 2.f);
			DrawLine(S.X - R, S.Y, S.X, S.Y - R, C, 2.f);
		}
	}
}

void ASRHUD::DrawDamage(float Dt)
{
	for (int32 i = Numbers.Num() - 1; i >= 0; --i)
	{
		FDmgNumber& N = Numbers[i];
		N.Age += Dt;
		if (N.Age > 1.1f)
		{
			Numbers.RemoveAt(i);
			continue;
		}
		FVector2D S;
		if (!ToScreen(N.At, S)) continue;
		const float Rise = N.Age * 70.f * UI;
		const float Pop = N.Age < 0.12f ? 1.f + (0.12f - N.Age) * 4.f : 1.f;
		FLinearColor C = N.Color;
		C.A = FMath::Clamp((1.1f - N.Age) / 0.4f, 0.f, 1.f);
		Txt(N.Text, S.X + N.DriftX * N.Age * UI, S.Y - Rise, C, N.Size * Pop, true);
	}
}

void ASRHUD::DrawBoss(ASRGameMode* GM)
{
	if (!GM || !GM->Boss.IsValid()) return;
	ASREnemy* B = GM->Boss.Get();
	if (B->IsDead() || !B->IsEngaged()) return;
	const float W = Canvas->ClipX, H = Canvas->ClipY;
	const float BW = 900.f * UI, X = W * 0.5f - BW * 0.5f, Y = H - 190.f * UI;
	Txt(B->DisplayName(), X, Y - 30.f * UI, FLinearColor::White, 22.f);
	Bar(X, Y, BW, 12.f * UI, B->HP / FMath::Max(1.f, B->MaxHP), FLinearColor(0.75f, 0.08f, 0.08f));
}

// ============================================================================
// Prompts, dialogue, Sage
// ============================================================================

void ASRHUD::DrawPrompt(ASlimeCharacter* P)
{
	const FString Prompt = P->GetInteractPrompt();
	if (Prompt.IsEmpty() || P->DialogTime > 0.f) return;
	const float W = Canvas->ClipX, H = Canvas->ClipY;
	const float TW = TxtW(Prompt, 22.f) + 40.f * UI;
	const float Y = H * 0.66f;
	Panel(W * 0.5f - TW * 0.5f, Y, TW, 42.f * UI, FLinearColor(0.f, 0.f, 0.f, 0.6f));
	Frame(W * 0.5f - TW * 0.5f, Y, TW, 42.f * UI, FLinearColor(1.f, 0.85f, 0.5f, 0.6f));
	Txt(Prompt, W * 0.5f, Y + 8.f * UI, FLinearColor::White, 22.f, true);
}

void ASRHUD::DrawDialog(ASlimeCharacter* P)
{
	if (P->DialogTime <= 0.f) return;
	const float W = Canvas->ClipX, H = Canvas->ClipY;
	const float PW = FMath::Min(1200.f * UI, W - 80.f * UI);
	const TArray<FString> Lines = Wrap(P->DialogText, PW - 60.f * UI, 23.f);
	const float PH = (70.f + Lines.Num() * 30.f) * UI;
	const float X = W * 0.5f - PW * 0.5f, Y = H - PH - 150.f * UI;
	const float A = FMath::Clamp(P->DialogTime / 0.4f, 0.f, 1.f);
	Panel(X, Y, PW, PH, FLinearColor(0.02f, 0.02f, 0.04f, 0.82f * A));
	Frame(X, Y, PW, PH, FLinearColor(1.f, 0.8f, 0.4f, 0.5f * A));
	Txt(P->DialogSpeaker, X + 30.f * UI, Y + 14.f * UI, FLinearColor(HudGold.R, HudGold.G, HudGold.B, A), 24.f);
	float LY = Y + 50.f * UI;
	for (const FString& L : Lines)
	{
		Txt(L, X + 30.f * UI, LY, FLinearColor(1.f, 1.f, 1.f, A), 23.f);
		LY += 30.f * UI;
	}
}

void ASRHUD::DrawOracle(float Dt)
{
	float Y = 262.f * UI;
	const float X = 28.f * UI;
	for (int32 i = Oracle.Num() - 1; i >= 0; --i)
	{
		Oracle[i].Age += Dt;
		if (Oracle[i].Age > 7.f) Oracle.RemoveAt(i);
	}
	for (FOracleLine& L : Oracle)
	{
		const float A = FMath::Clamp(FMath::Min(L.Age / 0.25f, (7.f - L.Age) / 0.8f), 0.f, 1.f);
		const TArray<FString> Lines = Wrap(L.Text, 560.f * UI, 19.f);
		const float H = (34.f + Lines.Num() * 24.f) * UI;
		Panel(X - 10.f * UI, Y, 600.f * UI, H, FLinearColor(0.f, 0.05f, 0.1f, 0.55f * A));
		DrawRect(FLinearColor(HudCyan.R, HudCyan.G, HudCyan.B, 0.8f * A), X - 10.f * UI, Y, 3.f * UI, H);
		Txt(TEXT("<< Il Saggio >>"), X, Y + 6.f * UI, FLinearColor(HudCyan.R, HudCyan.G, HudCyan.B, A), 16.f);
		float LY = Y + 28.f * UI;
		for (const FString& S : Lines)
		{
			Txt(S, X, LY, FLinearColor(1.f, 1.f, 1.f, A), 19.f);
			LY += 24.f * UI;
		}
		Y += H + 8.f * UI;
	}
}

void ASRHUD::DrawToast(float Dt)
{
	ToastAge += Dt;
	const float Dur = 3.4f;
	if (ToastAge > Dur || ToastBig.IsEmpty()) return;
	const float A = FMath::Clamp(FMath::Min(ToastAge / 0.35f, (Dur - ToastAge) / 0.7f), 0.f, 1.f);
	const float W = Canvas->ClipX, H = Canvas->ClipY;
	const float Y = H * 0.28f;
	Panel(0, Y - 20.f * UI, W, 130.f * UI, FLinearColor(0.f, 0.f, 0.f, 0.5f * A));
	DrawLine(W * 0.25f, Y + 74.f * UI, W * 0.75f, Y + 74.f * UI, FLinearColor(1.f, 0.85f, 0.5f, 0.6f * A), 1.5f);
	Txt(ToastBig, W * 0.5f, Y, FLinearColor(1.f, 0.88f, 0.55f, A), 54.f, true);
	Txt(ToastSmall, W * 0.5f, Y + 82.f * UI, FLinearColor(1.f, 1.f, 1.f, 0.85f * A), 22.f, true);
}

void ASRHUD::DrawKeyHints()
{
	const float H = Canvas->ClipY;
	Txt(TEXT("WASD muovi  Spazio salta  Shift corri  Q schiva  Mouse attacco/pesante  R abilita'  T cambia  E predazione  F interagisci  G forma  H pozione  I inventario  F1 aiuto"),
		28.f * UI, H - 28.f * UI, FLinearColor(1.f, 1.f, 1.f, 0.55f), 14.f);
}

// ============================================================================
// Overlays
// ============================================================================

void ASRHUD::DrawParty(ASlimeCharacter* P, ASRGameMode* GM)
{
	if (!GM) return;
	float Y = 186.f * UI;
	const float X = 28.f * UI;
	bool bAny = false;
	for (const ASRCompanion* C : GM->Companions)
	{
		if (!C || !C->bRecruited) continue;
		bAny = true;
		Txt(FString::Printf(TEXT("%s%s"), *C->DisplayName(), C->bMarried ? TEXT("  (sposata)") : TEXT("")), X, Y, FLinearColor(1.f, 0.75f, 0.85f), 16.f);
		Bar(X + 330.f * UI, Y + 6.f * UI, 110.f * UI, 6.f * UI, C->Affection / 100.f, FLinearColor(1.f, 0.4f, 0.6f));
		Y += 22.f * UI;
	}
	if (P->bSwimming)
	{
		Txt(TEXT("Stai nuotando  -  la stamina cala"), X, Y + (bAny ? 4.f : 0.f) * UI, FLinearColor(0.5f, 0.85f, 1.f), 16.f);
	}
}

void ASRHUD::DrawInventory(ASlimeCharacter* P)
{
	const float W = Canvas->ClipX, H = Canvas->ClipY;
	const float PW = 1100.f * UI, PH = 720.f * UI;
	const float X = W * 0.5f - PW * 0.5f, Y = H * 0.5f - PH * 0.5f;
	Panel(X, Y, PW, PH, FLinearColor(0.02f, 0.02f, 0.03f, 0.92f));
	Frame(X, Y, PW, PH, HudGold, 2.f);
	Txt(TEXT("INVENTARIO"), W * 0.5f, Y + 16.f * UI, HudGold, 30.f, true);
	Txt(FString::Printf(TEXT("Attacco %d   Difesa %d   Critico %d%%   Vita %d   Mana %d   Oro %d"),
		FMath::RoundToInt(P->GetAttack()), FMath::RoundToInt(P->GetDefense()), FMath::RoundToInt(P->GetCrit() * 100.f),
		FMath::RoundToInt(P->MaxHP), FMath::RoundToInt(P->MaxMP), P->Gold), W * 0.5f, Y + 60.f * UI, FLinearColor::White, 19.f, true);

	static const TCHAR* Slots[] = { TEXT("Arma"), TEXT("Armatura"), TEXT("Anello") };
	float LY = Y + 104.f * UI;
	for (int32 s = 0; s < 3; ++s)
	{
		const FSRItem& E = P->Equipped[s];
		Txt(Slots[s], X + 40.f * UI, LY, HudDim, 18.f);
		if (E.IsValid())
		{
			Txt(FString::Printf(TEXT("%s  [%s]"), *E.Name, SR::RarityName(E.Rarity)), X + 200.f * UI, LY, SR::RarityColor(E.Rarity), 19.f);
			Txt(SR::ItemStats(E), X + 700.f * UI, LY, HudDim, 17.f);
		}
		else
		{
			Txt(TEXT("-  vuoto  -"), X + 200.f * UI, LY, FLinearColor(0.5f, 0.5f, 0.5f), 18.f);
		}
		LY += 32.f * UI;
	}
	DrawLine(X + 30.f * UI, LY + 6.f * UI, X + PW - 30.f * UI, LY + 6.f * UI, FLinearColor(1.f, 0.85f, 0.5f, 0.4f), 1.f);
	LY += 20.f * UI;
	const int32 Pages = FMath::Max(1, (ASlimeCharacter::BagSize + 8) / 9);
	Txt(FString::Printf(TEXT("Borsa  %d / %d     pagina %d / %d"), P->Bag.Num(), ASlimeCharacter::BagSize, P->InvPage + 1, Pages), X + 40.f * UI, LY, HudGold, 19.f);
	LY += 34.f * UI;
	for (int32 k = 0; k < 9; ++k)
	{
		const int32 Idx = P->InvPage * 9 + k;
		if (!P->Bag.IsValidIndex(Idx)) break;
		const FSRItem& It = P->Bag[Idx];
		const FSRItem& Cur = P->Equipped[static_cast<int32>(It.Slot)];
		const bool bBetter = It.Score() > Cur.Score();
		Txt(FString::Printf(TEXT("%d.  %s  [%s]%s"), k + 1, *It.Name, SR::RarityName(It.Rarity), bBetter ? TEXT("  +") : TEXT("")), X + 40.f * UI, LY, SR::RarityColor(It.Rarity), 19.f);
		Txt(FString::Printf(TEXT("%s  %d oro"), *SR::ItemStats(It), It.Value), X + 640.f * UI, LY, bBetter ? FLinearColor(0.5f, 1.f, 0.5f) : HudDim, 16.f);
		LY += 34.f * UI;
	}
	Txt(TEXT("1-9 equipaggia   -   T pagina successiva   -   I / F chiudi   -   Elia al mercato compra il bottino"), W * 0.5f, Y + PH - 40.f * UI, HudDim, 17.f, true);
}

void ASRHUD::DrawGraceMenu(ASlimeCharacter* P)
{
	const float W = Canvas->ClipX, H = Canvas->ClipY;
	const TArray<FSRGrace>& G = SR::Graces();
	const float PW = 560.f * UI, PH = (110.f + G.Num() * 40.f) * UI;
	const float X = W * 0.5f - PW * 0.5f, Y = H * 0.5f - PH * 0.5f;
	Panel(X, Y, PW, PH, FLinearColor(0.03f, 0.02f, 0.f, 0.88f));
	Frame(X, Y, PW, PH, HudGold, 2.f);
	Txt(TEXT("GRAZIA  -  Viaggio rapido"), W * 0.5f, Y + 18.f * UI, HudGold, 28.f, true);
	for (int32 i = 0; i < G.Num(); ++i)
	{
		const bool bKnown = P->GraceFound.IsValidIndex(i) && P->GraceFound[i];
		const FString Line = FString::Printf(TEXT("%d.  %s"), i + 1, bKnown ? *G[i].Name : TEXT("? ? ?"));
		Txt(Line, X + 40.f * UI, Y + (70.f + i * 40.f) * UI, i == P->LastGrace ? HudGold : (bKnown ? FLinearColor::White : FLinearColor(0.5f, 0.5f, 0.5f)), 23.f);
	}
	Txt(TEXT("Premi il numero per viaggiare  -  F per chiudere"), W * 0.5f, Y + PH - 36.f * UI, HudDim, 17.f, true);
}

void ASRHUD::DrawHelp()
{
	const float W = Canvas->ClipX, H = Canvas->ClipY;
	static const TCHAR* Lines[] = {
		TEXT("W A S D / levetta sinistra  -  Muoviti           Mouse / levetta destra  -  Camera"),
		TEXT("Spazio / A  -  Salta                             Shift  -  Corri (stamina)"),
		TEXT("Q / B  -  Schivata con invulnerabilita'          Clic sinistro / X  -  Attacco (combo x3)"),
		TEXT("Clic destro / Y  -  Attacco pesante              Rotella (clic) / R3  -  Blocca bersaglio"),
		TEXT("R / LB  -  Usa abilita'    T / RT  -  Cambia abilita'    1-9  -  Scegli abilita'"),
		TEXT("E / RB  -  Predazione: divora il corpo di un nemico e ruba la sua abilita'"),
		TEXT("G / D-pad giu'  -  Mimetismo: Slime > Umano > Lupo Tempesta"),
		TEXT("F / D-pad su  -  Parla, compra, riposa alla Grazia (salva + viaggio rapido)"),
		TEXT("H / D-pad sinistra  -  Pozione curativa          Rotella  -  Zoom camera"),
		TEXT("I / Tab  -  Inventario: armi, armature e anelli trovati sui nemici"),
		TEXT("Kaede, Liora e Rhea vivono ad Altheria: parla con loro per farle unire al gruppo."),
		TEXT("Torre dei Mille Piani: fuori dalla porta est. Libera ogni piano per salire."),
		TEXT(""),
		TEXT("Gilda (Brann): missioni.  Mercato (Elia): pozioni.  Fabbro (Torvin): potenzia l'arma."),
		TEXT("Cattedrale (Lyra): cure gratuite.  Le zone piu' lontane hanno nemici piu' forti."),
	};
	const float PW = 1100.f * UI, PH = (100.f + UE_ARRAY_COUNT(Lines) * 34.f) * UI;
	const float X = W * 0.5f - PW * 0.5f, Y = H * 0.5f - PH * 0.5f;
	Panel(X, Y, PW, PH, FLinearColor(0.f, 0.f, 0.02f, 0.9f));
	Frame(X, Y, PW, PH, HudCyan, 2.f);
	Txt(TEXT("COMANDI"), W * 0.5f, Y + 18.f * UI, HudCyan, 30.f, true);
	for (int32 i = 0; i < static_cast<int32>(UE_ARRAY_COUNT(Lines)); ++i)
	{
		Txt(Lines[i], X + 40.f * UI, Y + (74.f + i * 34.f) * UI, FLinearColor::White, 20.f);
	}
}

void ASRHUD::DrawDeath(ASlimeCharacter* P)
{
	const float W = Canvas->ClipX, H = Canvas->ClipY;
	const float A = FMath::Clamp(P->DeadTime / 1.2f, 0.f, 1.f);
	Panel(0, 0, W, H, FLinearColor(0.f, 0.f, 0.f, 0.35f * A));
	Panel(0, H * 0.42f, W, 150.f * UI, FLinearColor(0.f, 0.f, 0.f, 0.75f * A));
	Txt(TEXT("SEI CADUTO"), W * 0.5f, H * 0.42f + 28.f * UI, FLinearColor(0.75f, 0.08f, 0.06f, A), 84.f, true, false);
}
