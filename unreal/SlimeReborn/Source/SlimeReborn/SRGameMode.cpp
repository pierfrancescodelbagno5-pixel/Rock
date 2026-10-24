#include "SRGameMode.h"
#include "SlimeReborn.h"
#include "SlimeCharacter.h"
#include "SREnemy.h"
#include "SRWorld.h"
#include "SRHUD.h"
#include "SRSaveGame.h"
#include "SRDungeon.h"
#include "SRCompanion.h"
#include "SRLoot.h"
#include "Components/CapsuleComponent.h"
#include "GameFramework/PlayerStart.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"
#include "EngineUtils.h"

static const TCHAR* SaveSlot = TEXT("SlimeReborn");

const FVector ASRGameMode::GuildSpot(-1700.f, -3350.f, 0.f);
const FVector ASRGameMode::SpawnSpot(-2600.f, 300.f, 0.f);

ASRGameMode::ASRGameMode()
{
	PrimaryActorTick.bCanEverTick = true;
	DefaultPawnClass = ASlimeCharacter::StaticClass();
	HUDClass = ASRHUD::StaticClass();
}

void ASRGameMode::InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage)
{
	Super::InitGame(MapName, Options, ErrorMessage);
	UWorld* W = GetWorld();
	for (TActorIterator<ASRWorld> It(W); It; ++It)
	{
		SRWorld = *It;
		break;
	}
	if (!SRWorld)
	{
		FActorSpawnParameters P;
		P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		SRWorld = W->SpawnActor<ASRWorld>(ASRWorld::StaticClass(), FTransform::Identity, P);
	}
	{
		FActorSpawnParameters P;
		P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		Dungeon = W->SpawnActor<ASRDungeon>(ASRDungeon::StaticClass(), FTransform::Identity, P);
	}
	bHasSave = UGameplayStatics::DoesSaveGameExist(SaveSlot, 0);
	ZoneStates.SetNum(SR::Zones().Num());
}

AActor* ASRGameMode::ChoosePlayerStart_Implementation(AController* Player)
{
	if (!StartSpot)
	{
		FActorSpawnParameters P;
		P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		const FVector Loc(SpawnSpot.X, SpawnSpot.Y, SR::CityZ + 140.f);
		StartSpot = GetWorld()->SpawnActor<APlayerStart>(APlayerStart::StaticClass(), Loc, FRotator::ZeroRotator, P);
	}
	return StartSpot ? StartSpot.Get() : Super::ChoosePlayerStart_Implementation(Player);
}

ASlimeCharacter* ASRGameMode::GetPlayer() const
{
	return Cast<ASlimeCharacter>(UGameplayStatics::GetPlayerPawn(this, 0));
}

void ASRGameMode::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (Companions.Num() == 0) SpawnCompanions();
	SpawnTimer += DeltaSeconds;
	if (SpawnTimer >= 0.5f)
	{
		UpdateSpawns();
		SpawnTimer = 0.f;
	}
}

void ASRGameMode::SpawnCompanions()
{
	UWorld* W = GetWorld();
	if (!W) return;
	for (int32 i = 0; i < ASRCompanion::Num; ++i)
	{
		const FVector2D H = ASRCompanion::HomeOf(i);
		const FTransform T(FRotator(0, 180.f, 0), FVector(H.X, H.Y, SR::CityZ + 110.f));
		ASRCompanion* C = W->SpawnActorDeferred<ASRCompanion>(ASRCompanion::StaticClass(), T, nullptr, nullptr, ESpawnActorCollisionHandlingMethod::AlwaysSpawn);
		if (!C) continue;
		C->Setup(i);
		C->FinishSpawning(T);
		Companions.Add(C);
	}
}

void ASRGameMode::RefreshSpouses()
{
	ASlimeCharacter* P = GetPlayer();
	if (!P) return;
	int32 N = 0;
	for (ASRCompanion* C : Companions)
	{
		if (C && C->bMarried) ++N;
	}
	if (N != P->SpouseCount)
	{
		P->SpouseCount = N;
		P->Recalc();
	}
}

// ============================================================================
// Menu / start
// ============================================================================

void ASRGameMode::StartGame(bool bContinue)
{
	ASlimeCharacter* P = GetPlayer();
	if (!P) return;
	bInMenu = false;
	if (bContinue && LoadProgress(P))
	{
		const TArray<FSRGrace>& G = SR::Graces();
		if (G.IsValidIndex(P->LastGrace)) P->TeleportPlayer(G[P->LastGrace].Location + FVector(250.f, 0, 0));
		P->Toast(TEXT("BENTORNATO"), SR::Class(P->ClassId).Name);
		P->Oracle(FString::Printf(TEXT("Partita caricata. Livello %d, %d abilita'."), P->Level, P->Skills.Num()));
	}
	else
	{
		QuestIndex = 0;
		QuestProgress = 0;
		bQuestActive = false;
		Kills = 0;
		if (Dungeon) Dungeon->BestFloor = 0;
		for (ASRCompanion* Cmp : Companions)
		{
			if (!Cmp) continue;
			Cmp->ApplyState(0.f, false, false);
			Cmp->ReturnHome();
		}
		P->SpouseCount = 0;
		P->ApplyClass(static_cast<ESRClass>(MenuClass), true);
		P->GraceFound.Init(false, SR::Graces().Num());
		if (P->GraceFound.Num() > 0) P->GraceFound[0] = true;
		P->LastGrace = 0;
		P->TeleportPlayer(SpawnSpot);
		P->Toast(TEXT("ALTHERIA"), TEXT("Citta' Reale - qui inizia la tua seconda vita"));
		P->Oracle(TEXT("Notifica: reincarnazione completata. Benvenuto nella Terra Spezzata, dove mille mondi si sono fusi in uno."));
		P->Oracle(TEXT("Premi F1 per i comandi. La Gilda degli Avventurieri e' a sud-ovest della fontana: parla con Brann."));
		if (P->IsPredator()) P->Oracle(TEXT("Abilita' unica: Predatore. Sconfiggi un mostro e premi E sul corpo per rubarne i poteri."));
	}
	if (AController* C = P->GetController()) C->SetControlRotation(FRotator(-12.f, 0.f, 0.f));
}

// ============================================================================
// Guild quests
// ============================================================================

const FSRQuest* ASRGameMode::ActiveQuest() const
{
	const TArray<FSRQuest>& Q = SR::Quests();
	return (bQuestActive && Q.IsValidIndex(QuestIndex)) ? &Q[QuestIndex] : nullptr;
}

FString ASRGameMode::GuildTalk(ASlimeCharacter* P)
{
	const TArray<FSRQuest>& Quests = SR::Quests();
	if (!Quests.IsValidIndex(QuestIndex))
	{
		return TEXT("Hai completato tutte le missioni della gilda: ora sei un avventuriero di rango S! Nuove minacce arriveranno con la prossima versione...");
	}
	const FSRQuest& Q = Quests[QuestIndex];
	if (!bQuestActive)
	{
		bQuestActive = true;
		QuestProgress = 0;
		P->Toast(TEXT("NUOVA MISSIONE"), Q.Title);
		return FString::Printf(TEXT("Missione \"%s\": %s Ricompensa: %d XP e %d oro. La zona e' segnata sulla bussola."), *Q.Title, *Q.Desc, Q.XP, Q.Gold);
	}
	if (QuestProgress >= Q.Need)
	{
		P->GiveXP(static_cast<float>(Q.XP));
		P->GiveGold(Q.Gold);
		P->Potions += 2;
		bQuestActive = false;
		++QuestIndex;
		P->Toast(TEXT("RICOMPENSA"), FString::Printf(TEXT("+%d XP   +%d oro   +2 pozioni"), Q.XP, Q.Gold));
		SaveProgress();
		return Quests.IsValidIndex(QuestIndex)
			? FString::Printf(TEXT("Ottimo lavoro! Ecco la tua paga. Quando sei pronto ho un altro incarico: \"%s\"."), *Quests[QuestIndex].Title)
			: TEXT("Incredibile... hai sconfitto il Re degli Orchi! Tutta Altheria canta il tuo nome.");
	}
	return FString::Printf(TEXT("\"%s\" in corso: %d/%d. Segui il segnale dorato sulla bussola."), *Q.Title, QuestProgress, Q.Need);
}

void ASRGameMode::OnEnemyKilled(ASREnemy* Enemy)
{
	ASlimeCharacter* P = GetPlayer();
	if (!P || !Enemy) return;
	++Kills;
	P->GiveXP(Enemy->XPValue);
	const int32 G = FMath::RandRange(2, 6) * Enemy->Level + (Enemy->bBoss ? 800 : 0);
	P->GiveGold(G);
	if (ASRHUD* H = Cast<ASRHUD>(Cast<APlayerController>(P->GetController()) ? Cast<APlayerController>(P->GetController())->GetHUD() : nullptr))
	{
		H->DamageNumber(Enemy->GetHeadLocation() + FVector(0, 0, 40.f), static_cast<float>(G), FLinearColor(1.f, 0.82f, 0.25f), TEXT("oro +"));
	}
	if (FMath::FRand() < (Enemy->bBoss ? 1.f : 0.32f))
	{
		const FVector Feet = Enemy->GetActorLocation() - FVector(0, 0, Enemy->GetCapsuleComponent()->GetScaledCapsuleHalfHeight() - 20.f);
		ASRLoot::Drop(GetWorld(), Feet, SR::RollItem(Enemy->Level, Enemy->bBoss ? 0.75f : 0.f));
	}
	for (ASRCompanion* Cmp : Companions)
	{
		if (Cmp && Cmp->bRecruited) Cmp->AddAffection(0.5f);
	}
	if (FMath::FRand() < (Enemy->bBoss ? 1.f : 0.07f))
	{
		P->Potions += Enemy->bBoss ? 5 : 1;
		P->Oracle(TEXT("Hai trovato una Pozione Curativa!"));
	}

	const FSRQuest* Q = ActiveQuest();
	if (Q && Q->Target == Enemy->Kind && QuestProgress < Q->Need)
	{
		++QuestProgress;
		if (QuestProgress >= Q->Need)
		{
			P->Toast(TEXT("OBIETTIVO COMPLETATO"), Q->Title);
			P->Oracle(TEXT("Missione completata! Torna da Brann alla Gilda di Altheria per la ricompensa."));
		}
		else
		{
			P->Oracle(FString::Printf(TEXT("%s: %d/%d"), *Q->Title, QuestProgress, Q->Need));
		}
	}

	if (Enemy->bBoss)
	{
		P->Toast(TEXT("NEMICO SCONFITTO"), SR::Enemy(Enemy->Kind).Name);
	}
	if (ZoneStates.IsValidIndex(Enemy->Zone))
	{
		ZoneStates[Enemy->Zone].Cooldown = FMath::Max(ZoneStates[Enemy->Zone].Cooldown, Enemy->bBoss ? 600.f : 10.f);
	}
	if (P->IsPredator() && !bAbsorbHint)
	{
		bAbsorbHint = true;
		P->Oracle(TEXT("Suggerimento: avvicinati al corpo e premi E per la Predazione."));
	}
}

void ASRGameMode::OnRest()
{
	for (int32 i = 0; i < ZoneStates.Num(); ++i)
	{
		FZoneState& S = ZoneStates[i];
		const bool bBossZone = SR::Zones()[i].Kind == ESREnemyKind::OrcKing;
		for (TWeakObjectPtr<ASREnemy>& E : S.Alive)
		{
			if (E.IsValid() && !E->IsEngaged() && !E->IsDead()) E->Destroy();
		}
		S.Alive.Reset();
		if (!bBossZone) S.Cooldown = 0.f;
	}
}

// ============================================================================
// Spawning
// ============================================================================

void ASRGameMode::UpdateSpawns()
{
	ASlimeCharacter* P = GetPlayer();
	if (!P || bInMenu) return;
	const FVector2D PL(P->GetActorLocation().X, P->GetActorLocation().Y);
	const TArray<FSRZone>& Zones = SR::Zones();
	UWorld* W = GetWorld();

	for (int32 i = 0; i < Zones.Num() && i < ZoneStates.Num(); ++i)
	{
		const FSRZone& Z = Zones[i];
		FZoneState& S = ZoneStates[i];
		S.Alive.RemoveAll([](const TWeakObjectPtr<ASREnemy>& E) { return !E.IsValid() || E->IsDead(); });
		S.Cooldown = FMath::Max(0.f, S.Cooldown - 0.5f);
		const float D = FVector2D::Distance(PL, Z.Center);

		if (D > Z.Radius + 45000.f)
		{
			for (TWeakObjectPtr<ASREnemy>& E : S.Alive)
			{
				if (E.IsValid() && !E->IsEngaged()) E->Destroy();
			}
			S.Alive.Reset();
			continue;
		}
		if (D > Z.Radius + 22000.f || S.Cooldown > 0.f || S.Alive.Num() >= Z.Max) continue;

		const float A = FMath::FRandRange(0.f, 2.f * PI);
		const float R = Z.Kind == ESREnemyKind::OrcKing ? 0.f : FMath::FRandRange(0.f, Z.Radius);
		const float X = Z.Center.X + FMath::Cos(A) * R;
		const float Y = Z.Center.Y + FMath::Sin(A) * R;
		const float H = SR::HeightAt(X, Y);
		if (H < 60.f) continue;
		if (FVector2D::Distance(PL, FVector2D(X, Y)) < 2200.f && Z.Kind != ESREnemyKind::OrcKing) continue;

		const FTransform T(FRotator(0, FMath::FRandRange(0.f, 360.f), 0), FVector(X, Y, H + (Z.Kind == ESREnemyKind::OrcKing ? 320.f : 160.f)));
		ASREnemy* E = W->SpawnActorDeferred<ASREnemy>(ASREnemy::StaticClass(), T, nullptr, nullptr, ESpawnActorCollisionHandlingMethod::AlwaysSpawn);
		if (!E) continue;
		const int32 Lvl = Z.Kind == ESREnemyKind::OrcKing ? Z.Level : Z.Level + FMath::RandRange(0, 2);
		E->Setup(Z.Kind, Lvl, i);
		E->FinishSpawning(T);
		S.Alive.Add(E);
		S.Cooldown = 0.25f;
		if (Z.Kind == ESREnemyKind::OrcKing) Boss = E;
	}
}

// ============================================================================
// Save / load
// ============================================================================

void ASRGameMode::SaveProgress()
{
	ASlimeCharacter* P = GetPlayer();
	if (!P || bInMenu) return;
	USRSaveGame* S = Cast<USRSaveGame>(UGameplayStatics::CreateSaveGameObject(USRSaveGame::StaticClass()));
	if (!S) return;
	S->ClassId = static_cast<uint8>(P->ClassId);
	S->Form = static_cast<uint8>(P->Form);
	S->Level = P->Level;
	S->XP = P->XP;
	S->Gold = P->Gold;
	S->Potions = P->Potions;
	S->WeaponLevel = P->WeaponLevel;
	S->Absorbed = P->Absorbed;
	S->BonusHP = P->BonusHP;
	for (ESRSkill K : P->Skills) S->Skills.Add(static_cast<uint8>(K));
	S->bHasWolf = P->bHasWolf;
	S->Graces = P->GraceFound;
	S->LastGrace = P->LastGrace;
	S->QuestIndex = QuestIndex;
	S->QuestProgress = QuestProgress;
	S->bQuestActive = bQuestActive;
	S->TimeOfDay = SRWorld ? SRWorld->TimeOfDay : 9.f;
	S->Kills = Kills;
	S->Bag = P->Bag;
	for (const FSRItem& E : P->Equipped) S->Equipped.Add(E);
	for (ASRCompanion* Cmp : Companions)
	{
		S->CompanionAffection.Add(Cmp ? Cmp->Affection : 0.f);
		S->CompanionRecruited.Add(Cmp && Cmp->bRecruited);
		S->CompanionMarried.Add(Cmp && Cmp->bMarried);
	}
	S->TowerBestFloor = Dungeon ? Dungeon->BestFloor : 0;
	bHasSave = UGameplayStatics::SaveGameToSlot(S, SaveSlot, 0) || bHasSave;
}

bool ASRGameMode::LoadProgress(ASlimeCharacter* P)
{
	if (!P || !UGameplayStatics::DoesSaveGameExist(SaveSlot, 0)) return false;
	USRSaveGame* S = Cast<USRSaveGame>(UGameplayStatics::LoadGameFromSlot(SaveSlot, 0));
	if (!S) return false;
	P->ApplyClass(static_cast<ESRClass>(FMath::Clamp<int32>(S->ClassId, 0, SR::NumClasses - 1)), true);
	P->Level = FMath::Max(1, S->Level);
	P->XP = S->XP;
	P->Gold = S->Gold;
	P->Potions = S->Potions;
	P->WeaponLevel = S->WeaponLevel;
	P->Absorbed = S->Absorbed;
	P->BonusHP = S->BonusHP;
	for (uint8 K : S->Skills) P->LearnSkill(static_cast<ESRSkill>(K), false);
	P->bHasWolf = S->bHasWolf;
	if (S->Graces.Num() == SR::Graces().Num()) P->GraceFound = S->Graces;
	P->LastGrace = S->LastGrace;
	P->Bag = S->Bag;
	for (int32 i = 0; i < 3 && i < S->Equipped.Num(); ++i) P->Equipped[i] = S->Equipped[i];
	for (int32 i = 0; i < Companions.Num(); ++i)
	{
		ASRCompanion* Cmp = Companions[i];
		if (!Cmp) continue;
		Cmp->ApplyState(S->CompanionAffection.IsValidIndex(i) ? S->CompanionAffection[i] : 0.f,
			S->CompanionRecruited.IsValidIndex(i) && S->CompanionRecruited[i],
			S->CompanionMarried.IsValidIndex(i) && S->CompanionMarried[i]);
		if (!Cmp->bRecruited) Cmp->ReturnHome();
	}
	if (Dungeon) Dungeon->BestFloor = S->TowerBestFloor;
	P->SpouseCount = 0;
	for (ASRCompanion* Cmp : Companions)
	{
		if (Cmp && Cmp->bMarried) ++P->SpouseCount;
	}
	P->Recalc();
	P->HP = P->MaxHP;
	P->MP = P->MaxMP;
	const ESRForm F = static_cast<ESRForm>(FMath::Clamp<int32>(S->Form, 0, 2));
	if (P->CanTransform() && (F != ESRForm::Wolf || P->bHasWolf)) P->SetForm(F, false);
	QuestIndex = S->QuestIndex;
	QuestProgress = S->QuestProgress;
	bQuestActive = S->bQuestActive;
	Kills = S->Kills;
	if (SRWorld) SRWorld->TimeOfDay = S->TimeOfDay;
	return true;
}
