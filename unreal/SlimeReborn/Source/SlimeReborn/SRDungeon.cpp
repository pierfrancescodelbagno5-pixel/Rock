#include "SRDungeon.h"
#include "SREnemy.h"
#include "SlimeCharacter.h"
#include "SRFx.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Engine/CollisionProfile.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"

const FVector ASRDungeon::Origin(420000.f, 0.f, 0.f);

namespace
{
	constexpr int32 DGrid = 3;
	constexpr float DCell = 3200.f;
	constexpr float DWallHeight = 900.f;
	constexpr float DWallThick = 200.f;
	constexpr float DDoor = 760.f;

	struct FDungeonTheme { uint32 Floor, Wall, Pillar, Glow; FLinearColor Light; const TCHAR* Name; };
	const FDungeonTheme DThemes[] = {
		{ 0x4a4540, 0x6a645a, 0x7a7468, 0xffb060, FLinearColor(1.f, 0.65f, 0.35f), TEXT("Sale di Pietra") },
		{ 0x9ab4c8, 0xbcd4e4, 0xd8ecf8, 0x80d0ff, FLinearColor(0.45f, 0.75f, 1.f), TEXT("Cripte di Ghiaccio") },
		{ 0x3a2420, 0x5a2a20, 0x2a1a18, 0xff5010, FLinearColor(1.f, 0.35f, 0.1f), TEXT("Fornaci di Lava") },
		{ 0x2a2440, 0x403a6a, 0x5a4a9a, 0xc070ff, FLinearColor(0.7f, 0.4f, 1.f), TEXT("Giardino di Cristallo") },
		{ 0x203a24, 0x2e5034, 0x3a6a3a, 0x90ff70, FLinearColor(0.5f, 1.f, 0.4f), TEXT("Rovine della Giungla") },
	};
}

ASRDungeon::ASRDungeon()
{
	PrimaryActorTick.bCanEverTick = true;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;
}

FVector ASRDungeon::CellCenter(int32 I, int32 J) const
{
	return Origin + FVector((I - 1) * DCell, (J - 1) * DCell, 0.f);
}

int32 ASRDungeon::EnemiesLeft() const
{
	int32 N = 0;
	for (const TWeakObjectPtr<ASREnemy>& E : Spawned)
	{
		if (E.IsValid() && !E->IsDead()) ++N;
	}
	return N;
}

int32 ASRDungeon::PortalNear(const FVector& Location) const
{
	if (!bActive) return 0;
	if (FVector::Dist2D(Location, UpPos) < 380.f) return 1;
	if (FVector::Dist2D(Location, OutPos) < 380.f) return 2;
	return 0;
}

void ASRDungeon::Clear()
{
	for (TWeakObjectPtr<ASREnemy>& E : Spawned)
	{
		if (E.IsValid()) E->Destroy();
	}
	Spawned.Reset();
	for (UHierarchicalInstancedStaticMeshComponent* H : { FloorH.Get(), WallH.Get(), PillarH.Get(), CeilH.Get(), GlowH.Get() })
	{
		if (H) H->ClearInstances();
	}
}

void ASRDungeon::SpawnEnemy(ESREnemyKind Kind, int32 Level, const FVector& At, float Elite)
{
	const FTransform T(FRotator(0, FMath::FRandRange(0.f, 360.f), 0), At + FVector(0, 0, 260.f));
	ASREnemy* E = GetWorld()->SpawnActorDeferred<ASREnemy>(ASREnemy::StaticClass(), T, nullptr, nullptr, ESpawnActorCollisionHandlingMethod::AlwaysSpawn);
	if (!E) return;
	E->Setup(Kind, Level, -1, Elite);
	E->FinishSpawning(T);
	Spawned.Add(E);
}

void ASRDungeon::Build(int32 InFloor)
{
	Floor = InFloor;
	bCleared = false;
	const FDungeonTheme& Th = DThemes[((Floor - 1) / 5) % UE_ARRAY_COUNT(DThemes)];

	if (!bBuilt)
	{
		bBuilt = true;
		auto Make = [this](const TCHAR* Shape, bool bCollide, ESRMat Mat) -> UHierarchicalInstancedStaticMeshComponent*
		{
			UHierarchicalInstancedStaticMeshComponent* H = NewObject<UHierarchicalInstancedStaticMeshComponent>(this);
			H->SetStaticMesh(SR::Mesh(Shape));
			UMaterialInstanceDynamic* M = SR::MakeMID(H, FLinearColor::White, Mat, Mat == ESRMat::Fx ? 8.f : 0.f);
			H->SetMaterial(0, M);
			Mids.Add(M);
			H->SetCollisionProfileName(bCollide ? UCollisionProfile::BlockAll_ProfileName : UCollisionProfile::NoCollision_ProfileName);
			H->SetCanEverAffectNavigation(false);
			if (Mat == ESRMat::Fx) H->SetCastShadow(false);
			H->SetupAttachment(Root);
			H->RegisterComponent();
			return H;
		};
		FloorH = Make(TEXT("Cube"), true, ESRMat::Lit);
		WallH = Make(TEXT("Cube"), true, ESRMat::Lit);
		PillarH = Make(TEXT("Cylinder"), true, ESRMat::Lit);
		CeilH = Make(TEXT("Cube"), true, ESRMat::Lit);
		GlowH = Make(TEXT("Sphere"), false, ESRMat::Fx);
		UpPortal = SR::AddPart(this, Root, TEXT("Cylinder"), FVector::ZeroVector, FVector(3.f, 3.f, 0.08f), FLinearColor(1.f, 0.8f, 0.3f), FRotator::ZeroRotator, ESRMat::Fx, 0.5f);
		OutPortal = SR::AddPart(this, Root, TEXT("Cylinder"), FVector::ZeroVector, FVector(2.4f, 2.4f, 0.08f), FLinearColor(0.3f, 0.7f, 1.f), FRotator::ZeroRotator, ESRMat::Fx, 6.f);
		for (int32 i = 0; i < DGrid * DGrid; ++i)
		{
			UPointLightComponent* L = NewObject<UPointLightComponent>(this);
			L->SetMobility(EComponentMobility::Movable);
			L->SetAttenuationRadius(2800.f);
			L->SetCastShadows(false);
			L->SetupAttachment(Root);
			L->RegisterComponent();
			Lights.Add(L);
		}
	}
	if (Mids.Num() >= 5)
	{
		Mids[0]->SetVectorParameterValue(TEXT("Color"), SR::Hex(Th.Floor));
		Mids[1]->SetVectorParameterValue(TEXT("Color"), SR::Hex(Th.Wall));
		Mids[2]->SetVectorParameterValue(TEXT("Color"), SR::Hex(Th.Pillar));
		Mids[3]->SetVectorParameterValue(TEXT("Color"), SR::Hex(Th.Wall) * 0.6f);
		Mids[4]->SetVectorParameterValue(TEXT("Color"), SR::Hex(Th.Glow));
	}

	FRandomStream R(9173 + Floor * 31);
	const float Span = DGrid * DCell;

	// Floor slab and ceiling
	FloorH->AddInstance(FTransform(FRotator::ZeroRotator, Origin + FVector(0, 0, -50.f), FVector(Span / 100.f + 2.f, Span / 100.f + 2.f, 1.f)));
	CeilH->AddInstance(FTransform(FRotator::ZeroRotator, Origin + FVector(0, 0, DWallHeight + 50.f), FVector(Span / 100.f + 2.f, Span / 100.f + 2.f, 1.f)));

	// Maze: random spanning tree over the 3x3 rooms plus one extra loop
	bool Open[DGrid][DGrid][2] = {};          // [i][j][0] = door to (i+1, j), [i][j][1] = door to (i, j+1)
	bool Seen[DGrid][DGrid] = {};
	TArray<FIntPoint> Stack;
	Stack.Add(FIntPoint(0, 0));
	Seen[0][0] = true;
	while (Stack.Num() > 0)
	{
		const FIntPoint C = Stack.Last();
		TArray<FIntPoint> Next;
		const FIntPoint Dirs[4] = { FIntPoint(1, 0), FIntPoint(-1, 0), FIntPoint(0, 1), FIntPoint(0, -1) };
		for (const FIntPoint& D : Dirs)
		{
			const FIntPoint N = C + D;
			if (N.X >= 0 && N.X < DGrid && N.Y >= 0 && N.Y < DGrid && !Seen[N.X][N.Y]) Next.Add(N);
		}
		if (Next.Num() == 0) { Stack.Pop(); continue; }
		const FIntPoint N = Next[R.RandRange(0, Next.Num() - 1)];
		if (N.X != C.X) Open[FMath::Min(N.X, C.X)][C.Y][0] = true;
		else Open[C.X][FMath::Min(N.Y, C.Y)][1] = true;
		Seen[N.X][N.Y] = true;
		Stack.Add(N);
	}
	Open[R.RandRange(0, DGrid - 2)][R.RandRange(0, DGrid - 1)][0] = true;

	auto Wall = [this](const FVector& Center, bool bAlongX, float Length)
	{
		const FVector S = bAlongX ? FVector(Length, DWallThick, DWallHeight) : FVector(DWallThick, Length, DWallHeight);
		WallH->AddInstance(FTransform(FRotator::ZeroRotator, Center + FVector(0, 0, DWallHeight * 0.5f), S / 100.f));
	};
	auto WallWithDoor = [&](const FVector& Center, bool bAlongX)
	{
		const float Piece = (DCell - DDoor) * 0.5f;
		const FVector Off = bAlongX ? FVector((DDoor + Piece) * 0.5f, 0, 0) : FVector(0, (DDoor + Piece) * 0.5f, 0);
		Wall(Center - Off, bAlongX, Piece);
		Wall(Center + Off, bAlongX, Piece);
		// lintel over the doorway
		const FVector S = bAlongX ? FVector(DDoor, DWallThick, 250.f) : FVector(DWallThick, DDoor, 250.f);
		WallH->AddInstance(FTransform(FRotator::ZeroRotator, Center + FVector(0, 0, DWallHeight - 125.f), S / 100.f));
	};

	// Outer walls
	for (int32 k = 0; k < DGrid; ++k)
	{
		const float A = (k - 1) * DCell;
		Wall(Origin + FVector(-Span * 0.5f, A, 0), false, DCell + DWallThick);
		Wall(Origin + FVector(Span * 0.5f, A, 0), false, DCell + DWallThick);
		Wall(Origin + FVector(A, -Span * 0.5f, 0), true, DCell + DWallThick);
		Wall(Origin + FVector(A, Span * 0.5f, 0), true, DCell + DWallThick);
	}
	// Inner walls
	for (int32 i = 0; i < DGrid; ++i)
	{
		for (int32 j = 0; j < DGrid; ++j)
		{
			const FVector C = CellCenter(i, j);
			if (i < DGrid - 1)
			{
				const FVector W = C + FVector(DCell * 0.5f, 0, 0);
				if (Open[i][j][0]) WallWithDoor(W, false); else Wall(W, false, DCell);
			}
			if (j < DGrid - 1)
			{
				const FVector W = C + FVector(0, DCell * 0.5f, 0);
				if (Open[i][j][1]) WallWithDoor(W, true); else Wall(W, true, DCell);
			}
			// Pillars and a hanging glow per room
			const int32 NP = R.RandRange(0, 3);
			for (int32 p = 0; p < NP; ++p)
			{
				const FVector Off(R.FRandRange(-1000.f, 1000.f), R.FRandRange(-1000.f, 1000.f), 0.f);
				if (Off.Size2D() < 500.f) continue;
				const float Rad = R.FRandRange(1.6f, 2.8f);
				PillarH->AddInstance(FTransform(FRotator::ZeroRotator, C + Off + FVector(0, 0, DWallHeight * 0.5f), FVector(Rad, Rad, DWallHeight / 100.f)));
			}
			GlowH->AddInstance(FTransform(FRotator::ZeroRotator, C + FVector(0, 0, DWallHeight - 60.f), FVector(0.6f)));
			UPointLightComponent* L = Lights[i * DGrid + j];
			L->SetRelativeLocation(C + FVector(0, 0, DWallHeight - 150.f));
			L->SetLightColor(Th.Light);
			L->SetIntensity(9000.f);
		}
	}

	// Start room (0,0) with the exit portal, goal room (2,2) with the portal upwards
	StartPos = CellCenter(0, 0);
	OutPos = StartPos + FVector(-900.f, -900.f, 4.f);
	UpPos = CellCenter(DGrid - 1, DGrid - 1) + FVector(0, 0, 4.f);
	OutPortal->SetWorldLocation(OutPos);
	UpPortal->SetWorldLocation(UpPos);
	if (UMaterialInstanceDynamic* M = Cast<UMaterialInstanceDynamic>(UpPortal->GetMaterial(0)))
	{
		M->SetVectorParameterValue(TEXT("Color"), FLinearColor(0.4f, 0.4f, 0.45f));
		M->SetScalarParameterValue(TEXT("Glow"), 0.5f);
	}

	// Monsters
	static const ESREnemyKind Tiers[3][3] = {
		{ ESREnemyKind::Goblin, ESREnemyKind::Wolf, ESREnemyKind::Spider },
		{ ESREnemyKind::Orc, ESREnemyKind::Lizardman, ESREnemyKind::Spider },
		{ ESREnemyKind::Knight, ESREnemyKind::Orc, ESREnemyKind::Lizardman } };
	const int32 Tier = FMath::Min(2, (Floor - 1) / 6);
	const int32 Level = 2 + FMath::RoundToInt(Floor * 1.25f);
	const bool bChampion = Floor % 5 == 0;
	const int32 Count = bChampion ? 3 : FMath::Min(14, 4 + Floor / 2);
	for (int32 n = 0; n < Count; ++n)
	{
		int32 I = 0, J = 0;
		while (I == 0 && J == 0) { I = R.RandRange(0, DGrid - 1); J = R.RandRange(0, DGrid - 1); }
		const FVector At = CellCenter(I, J) + FVector(R.FRandRange(-800.f, 800.f), R.FRandRange(-800.f, 800.f), 0.f);
		SpawnEnemy(Tiers[Tier][R.RandRange(0, 2)], Level, At, 1.f);
	}
	if (bChampion)
	{
		static const ESREnemyKind Champs[] = { ESREnemyKind::Orc, ESREnemyKind::Knight, ESREnemyKind::Lizardman, ESREnemyKind::Wolf, ESREnemyKind::Spider };
		SpawnEnemy(Champs[(Floor / 5 - 1) % UE_ARRAY_COUNT(Champs)], Level + 3, UpPos + FVector(-700.f, -700.f, 0.f), 5.f + Floor * 0.2f);
	}
}

void ASRDungeon::Enter(ASlimeCharacter* Player)
{
	if (!Player) return;
	Clear();
	bActive = true;
	Build(StartFloor());
	Player->bInDungeon = true;
	Player->TeleportExact(StartPos + FVector(300.f, 300.f, 0.f));
	const FDungeonTheme& Th = DThemes[((Floor - 1) / 5) % UE_ARRAY_COUNT(DThemes)];
	Player->Toast(FString::Printf(TEXT("PIANO %d"), Floor), FString::Printf(TEXT("Torre dei Mille Piani - %s"), Th.Name));
	Player->Oracle(TEXT("Sconfiggi tutti i nemici del piano per aprire il portale dorato. Il portale blu riporta fuori."));
}

void ASRDungeon::NextFloor(ASlimeCharacter* Player)
{
	if (!Player || !bCleared) return;
	Clear();
	Build(Floor + 1);
	Player->TeleportExact(StartPos + FVector(300.f, 300.f, 0.f));
	const FDungeonTheme& Th = DThemes[((Floor - 1) / 5) % UE_ARRAY_COUNT(DThemes)];
	Player->Toast(FString::Printf(TEXT("PIANO %d"), Floor), Floor % 5 == 0 ? FString(TEXT("Un campione ti attende...")) : FString(Th.Name));
}

void ASRDungeon::Exit(ASlimeCharacter* Player, bool bTeleportOut)
{
	Clear();
	bActive = false;
	if (!Player) return;
	Player->bInDungeon = false;
	if (bTeleportOut)
	{
		Player->TeleportTo(SR::TowerDoor() + FVector(0, -400.f, 0));
		Player->Toast(TEXT("TORRE DEI MILLE PIANI"), FString::Printf(TEXT("Piano massimo raggiunto: %d"), BestFloor));
	}
}

void ASRDungeon::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!bActive) return;
	Clock += DeltaSeconds;
	if (OutPortal) OutPortal->SetRelativeRotation(FRotator(0, Clock * 60.f, 0));
	if (!bCleared && EnemiesLeft() == 0)
	{
		bCleared = true;
		BestFloor = FMath::Max(BestFloor, Floor);
		if (UMaterialInstanceDynamic* M = Cast<UMaterialInstanceDynamic>(UpPortal->GetMaterial(0)))
		{
			M->SetVectorParameterValue(TEXT("Color"), FLinearColor(1.f, 0.8f, 0.3f));
			M->SetScalarParameterValue(TEXT("Glow"), 10.f);
		}
		ASRFx::Spawn(GetWorld(), ESRFxKind::Pillar, UpPos, FLinearColor(1.f, 0.8f, 0.3f), 150.f, 1.2f);
		if (ASlimeCharacter* P = Cast<ASlimeCharacter>(GetWorld()->GetFirstPlayerController() ? GetWorld()->GetFirstPlayerController()->GetPawn() : nullptr))
		{
			P->GiveXP(40.f * Floor);
			P->GiveGold(15 * Floor);
			P->Toast(TEXT("PIANO SUPERATO"), FString::Printf(TEXT("+%d XP  +%d oro  -  il portale dorato e' aperto"), 40 * Floor, 15 * Floor));
			if (Floor % 5 == 0) P->Oracle(FString::Printf(TEXT("Checkpoint: la prossima volta ripartirai dal piano %d."), Floor + 1));
		}
	}
	if (UpPortal) UpPortal->SetRelativeRotation(FRotator(0, -Clock * 40.f, 0));
}
