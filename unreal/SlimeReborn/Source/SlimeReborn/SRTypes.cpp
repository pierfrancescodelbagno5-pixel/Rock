#include "SRTypes.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInterface.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Components/StaticMeshComponent.h"
#include "Components/SceneComponent.h"
#include "GameFramework/Actor.h"
#include "Misc/PackageName.h"

// ============================================================================
// Noise
// ============================================================================

static float Hash2(int32 X, int32 Y)
{
	uint32 H = static_cast<uint32>(X) * 374761393u + static_cast<uint32>(Y) * 668265263u;
	H = (H ^ (H >> 13)) * 1274126177u;
	H ^= H >> 16;
	return static_cast<float>(H & 0xFFFFFFu) / static_cast<float>(0xFFFFFFu);
}

float SR::Noise2(float X, float Y)
{
	const int32 XI = FMath::FloorToInt(X);
	const int32 YI = FMath::FloorToInt(Y);
	const float XF = X - XI;
	const float YF = Y - YI;
	const float U = XF * XF * (3.f - 2.f * XF);
	const float V = YF * YF * (3.f - 2.f * YF);
	const float A = Hash2(XI, YI), B = Hash2(XI + 1, YI), C = Hash2(XI, YI + 1), D = Hash2(XI + 1, YI + 1);
	return FMath::Lerp(FMath::Lerp(A, B, U), FMath::Lerp(C, D, U), V) * 2.f - 1.f;
}

static float Fbm(float X, float Y, int32 Octaves)
{
	float Sum = 0.f, Amp = 0.5f, F = 1.f;
	for (int32 i = 0; i < Octaves; ++i)
	{
		Sum += Amp * SR::Noise2(X * F + i * 17.3f, Y * F - i * 9.1f);
		F *= 2.03f;
		Amp *= 0.5f;
	}
	return Sum;
}

static float Ridged(float X, float Y, int32 Octaves)
{
	float Sum = 0.f, Amp = 0.55f, F = 1.f;
	for (int32 i = 0; i < Octaves; ++i)
	{
		const float N = 1.f - FMath::Abs(SR::Noise2(X * F + i * 5.7f, Y * F + i * 3.3f));
		Sum += Amp * N * N;
		F *= 2.1f;
		Amp *= 0.48f;
	}
	return Sum;
}

static float Dist2(float X, float Y, float CX, float CY)
{
	return FMath::Sqrt(FMath::Square(X - CX) + FMath::Square(Y - CY));
}

// ============================================================================
// World layout. +X = North, +Y = East. The royal city of Altheria sits at the origin.
// ============================================================================

float SR::HeightAt(float X, float Y)
{
	const float D = FMath::Sqrt(X * X + Y * Y) / WorldHalf;

	float H = 900.f + Fbm(X * 0.000018f + 11.3f, Y * 0.000018f - 4.1f, 4) * 3400.f;
	H += Fbm(X * 0.00011f, Y * 0.00011f, 3) * 380.f;

	// Northern mountains
	const float M = FMath::SmoothStep(30000.f, 105000.f, X);
	if (M > 0.f)
	{
		H += M * (Ridged(X * 0.000034f + 3.f, Y * 0.000034f + 7.f, 5) * 12500.f + 1200.f);
	}

	// Eastern rolling hills / badlands
	const float E = FMath::SmoothStep(30000.f, 90000.f, Y) * (1.f - M);
	H += E * Ridged(X * 0.00005f, Y * 0.00005f, 3) * 2600.f;

	// South-eastern swamp lake
	const float L = 1.f - FMath::SmoothStep(5000.f, 17000.f, Dist2(X, Y, -60000.f, 50000.f));
	H = FMath::Lerp(H, -450.f, L * 0.92f);

	// Island coastline
	const float Edge = FMath::SmoothStep(0.80f, 0.97f, D);
	H = FMath::Lerp(H, -2600.f, Edge);

	// The city plateau
	const float C = 1.f - FMath::SmoothStep(CityR + 500.f, CityR + 7000.f, FMath::Sqrt(X * X + Y * Y));
	H = FMath::Lerp(H, CityZ, C);
	return H;
}

FVector SR::NormalAt(float X, float Y)
{
	const float E = 120.f;
	const float DX = HeightAt(X - E, Y) - HeightAt(X + E, Y);
	const float DY = HeightAt(X, Y - E) - HeightAt(X, Y + E);
	return FVector(DX, DY, 2.f * E).GetSafeNormal();
}

int32 SR::BiomeAt(float X, float Y)
{
	if (Dist2(X, Y, -60000.f, 50000.f) < 26000.f) return 5;
	if (X > 45000.f) return 3;
	if (Y > 40000.f) return 2;
	if (Y < -35000.f) return 1;
	if (X < -40000.f) return 4;
	return 0;
}

FString SR::RegionName(const FVector& P)
{
	if (FMath::Sqrt(P.X * P.X + P.Y * P.Y) < CityR + 300.f) return TEXT("Altheria, Citta' Reale");
	switch (BiomeAt(P.X, P.Y))
	{
	case 1: return TEXT("Foresta di Jura");
	case 2: return TEXT("Calanchi Cremisi");
	case 3: return P.Z > SnowZ ? TEXT("Vette dell'Eterno Gelo") : TEXT("Passi del Nord");
	case 4: return TEXT("Prati Meridionali");
	case 5: return TEXT("Palude delle Squame");
	default: return TEXT("Piane di Altheria");
	}
}

// ============================================================================
// Game data
// ============================================================================

const FSRSkillInfo& SR::Skill(ESRSkill S)
{
	static const FSRSkillInfo Table[] = {
		{ TEXT("-"), TEXT(""), 0.f, 0.f, FLinearColor::White },
		{ TEXT("Lama d'Acqua"), TEXT("Una lama d'acqua ad alta pressione che taglia in linea retta."), 8.f, 0.45f, FLinearColor(0.2f, 0.75f, 1.f) },
		{ TEXT("Palla di Fuoco"), TEXT("Sfera infuocata che esplode all'impatto."), 14.f, 1.1f, FLinearColor(1.f, 0.45f, 0.08f) },
		{ TEXT("Soffio Infuocato"), TEXT("Cono di fiamme davanti a te."), 18.f, 2.2f, FLinearColor(1.f, 0.25f, 0.05f) },
		{ TEXT("Fulmine Nero"), TEXT("Un fulmine colpisce il bersaglio e chi gli sta vicino."), 22.f, 2.8f, FLinearColor(0.6f, 0.3f, 1.f) },
		{ TEXT("Onda Sismica"), TEXT("Colpisci il suolo: onda d'urto ad area."), 16.f, 2.4f, FLinearColor(0.75f, 0.5f, 0.25f) },
		{ TEXT("Lama Oscura"), TEXT("Fendente rotante a 360 gradi."), 14.f, 1.6f, FLinearColor(0.45f, 0.1f, 0.7f) },
		{ TEXT("Filo Vincolante"), TEXT("Filo appiccicoso che immobilizza il nemico."), 6.f, 1.0f, FLinearColor(0.9f, 0.9f, 0.85f) },
		{ TEXT("Rigenerazione"), TEXT("Rigenera rapidamente il 45% della vita."), 25.f, 9.f, FLinearColor(0.3f, 1.f, 0.45f) },
		{ TEXT("Divoratore"), TEXT("Lo stomaco infinito risucchia e divora tutto attorno a te."), 45.f, 12.f, FLinearColor(0.35f, 0.f, 0.55f) },
	};
	const int32 I = FMath::Clamp(static_cast<int32>(S), 0, static_cast<int32>(ESRSkill::MAX) - 1);
	return Table[I];
}

const FSRClassInfo& SR::Class(ESRClass C)
{
	static const FSRClassInfo Table[] = {
		{ TEXT("Slime Predatore"), TEXT("Rinato come slime"), TEXT("Assorbe le abilita' dei nemici e si trasforma (umano, lupo)."), 130.f, 110.f, 12.f, true },
		{ TEXT("Spadaccino"), TEXT("Lama del Regno"), TEXT("Tanta vita, colpi pesanti, Lama Oscura dal primo livello."), 210.f, 60.f, 18.f, false },
		{ TEXT("Arcimago"), TEXT("Erede delle Torri"), TEXT("Mana enorme, Palla di Fuoco e Fulmine Nero."), 105.f, 220.f, 8.f, false },
		{ TEXT("L'Imperatore Infinito"), TEXT("Pierfrancesco Del Bagno"), TEXT("Classe mitica: tutte le forme, tutte le abilita', Predatore e Divoratore. XP doppia."), 420.f, 420.f, 34.f, true },
	};
	return Table[FMath::Clamp(static_cast<int32>(C), 0, 3)];
}

const FSREnemyInfo& SR::Enemy(ESREnemyKind K)
{
	static const FSREnemyInfo Table[] = {
		{ TEXT("Goblin"),            45.f,  7.f, 360.f, 170.f,   18.f, 0.85f, ESRSkill::None },
		{ TEXT("Lupo Tempesta"),     60.f,  9.f, 560.f, 190.f,   30.f, 1.0f,  ESRSkill::None },
		{ TEXT("Ragno Tessitore"),   70.f, 10.f, 420.f, 220.f,   40.f, 1.0f,  ESRSkill::StickyThread },
		{ TEXT("Orco"),             160.f, 18.f, 330.f, 240.f,   70.f, 1.35f, ESRSkill::Shockwave },
		{ TEXT("Uomo Lucertola"),   120.f, 15.f, 420.f, 220.f,   60.f, 1.1f,  ESRSkill::FireBreath },
		{ TEXT("Cavaliere Caduto"), 260.f, 26.f, 360.f, 250.f,  140.f, 1.25f, ESRSkill::BlackSlash },
		{ TEXT("Re degli Orchi"),  2400.f, 46.f, 380.f, 420.f, 1500.f, 2.6f,  ESRSkill::Devour },
	};
	return Table[FMath::Clamp(static_cast<int32>(K), 0, 6)];
}

const TArray<FSRGrace>& SR::Graces()
{
	static TArray<FSRGrace> List;
	if (List.Num() == 0)
	{
		auto Add = [](const TCHAR* N, float X, float Y) { List.Add({ N, Ground(X, Y) }); };
		Add(TEXT("Fontana di Altheria"), -1200.f, 1400.f);
		Add(TEXT("Soglia della Foresta"), 6000.f, -42000.f);
		Add(TEXT("Accampamento Goblin"), -20000.f, -16000.f);
		Add(TEXT("Colline Orchesche"), 14000.f, 52000.f);
		Add(TEXT("Riva della Palude"), -55000.f, 24000.f);
		Add(TEXT("Passo del Nord"), 62000.f, 6000.f);
		Add(TEXT("Soglia del Trono"), 30000.f, 82000.f);
		Add(TEXT("Nido dei Ragni"), -14000.f, -82000.f);
	}
	return List;
}

const TArray<FSRZone>& SR::Zones()
{
	static TArray<FSRZone> List;
	if (List.Num() == 0)
	{
		List.Add({ TEXT("Accampamento Goblin"), FVector2D(-28000.f, -24000.f), 9000.f, ESREnemyKind::Goblin, 9, 1 });
		List.Add({ TEXT("Bosco dei Lupi"), FVector2D(6000.f, -58000.f), 13000.f, ESREnemyKind::Wolf, 7, 3 });
		List.Add({ TEXT("Tana dei Ragni"), FVector2D(-18000.f, -94000.f), 9000.f, ESREnemyKind::Spider, 7, 5 });
		List.Add({ TEXT("Colline Orchesche"), FVector2D(22000.f, 64000.f), 14000.f, ESREnemyKind::Orc, 6, 7 });
		List.Add({ TEXT("Palude delle Squame"), FVector2D(-64000.f, 30000.f), 12000.f, ESREnemyKind::Lizardman, 7, 9 });
		List.Add({ TEXT("Rovine del Nord"), FVector2D(78000.f, 9000.f), 14000.f, ESREnemyKind::Knight, 5, 13 });
		List.Add({ TEXT("Trono del Re degli Orchi"), FVector2D(40000.f, 94000.f), 2500.f, ESREnemyKind::OrcKing, 1, 16 });
		List.Add({ TEXT("Strada Meridionale"), FVector2D(-26000.f, 6000.f), 10000.f, ESREnemyKind::Goblin, 5, 2 });
		List.Add({ TEXT("Piana dei Lupi"), FVector2D(-46000.f, -30000.f), 12000.f, ESREnemyKind::Wolf, 5, 4 });
	}
	return List;
}

const TArray<FSRQuest>& SR::Quests()
{
	static TArray<FSRQuest> List;
	if (List.Num() == 0)
	{
		List.Add({ TEXT("Caccia ai Goblin"), TEXT("I goblin assaltano le carovane a sud-ovest. Eliminane 5."), ESREnemyKind::Goblin, 5, 150, 60, 0 });
		List.Add({ TEXT("Zanne nella Foresta"), TEXT("Lupi Tempesta minacciano i taglialegna a ovest. Abbattine 4."), ESREnemyKind::Wolf, 4, 320, 90, 1 });
		List.Add({ TEXT("Il Nido Tessitore"), TEXT("Ragni giganti infestano il sud-ovest profondo. Uccidine 4."), ESREnemyKind::Spider, 4, 450, 120, 2 });
		List.Add({ TEXT("Il Peso degli Orchi"), TEXT("Gli orchi si radunano sulle colline a est. Sconfiggine 5."), ESREnemyKind::Orc, 5, 700, 180, 3 });
		List.Add({ TEXT("Squame nella Palude"), TEXT("Gli uomini lucertola sputano fuoco nella palude. Sconfiggine 5."), ESREnemyKind::Lizardman, 5, 950, 240, 4 });
		List.Add({ TEXT("I Cavalieri Caduti"), TEXT("Spettri in armatura vagano tra le rovine del nord. Abbattine 3."), ESREnemyKind::Knight, 3, 1400, 350, 5 });
		List.Add({ TEXT("Il Re degli Orchi"), TEXT("Il signore della fame siede sul trono a nord-est. Distruggilo."), ESREnemyKind::OrcKing, 1, 4000, 1200, 6 });
	}
	return List;
}

float SR::XPForLevel(int32 Level)
{
	return FMath::RoundToFloat(80.f * FMath::Pow(static_cast<float>(FMath::Max(1, Level)), 1.55f));
}

// ============================================================================
// Primitive art helpers
// ============================================================================

FLinearColor SR::Hex(uint32 RGB)
{
	return FLinearColor(FColor((RGB >> 16) & 0xFF, (RGB >> 8) & 0xFF, RGB & 0xFF));
}

UStaticMesh* SR::Mesh(const TCHAR* Shape)
{
	const FString Path = FString::Printf(TEXT("/Engine/BasicShapes/%s.%s"), Shape, Shape);
	return LoadObject<UStaticMesh>(nullptr, *Path);
}

static UMaterialInterface* LoadOptionalMaterial(const TCHAR* Package)
{
	if (!FPackageName::DoesPackageExist(Package)) return nullptr;
	const FString Name = FPackageName::GetShortName(Package);
	return LoadObject<UMaterialInterface>(nullptr, *FString::Printf(TEXT("%s.%s"), Package, *Name));
}

UMaterialInterface* SR::Material(ESRMat Mat)
{
	static TWeakObjectPtr<UMaterialInterface> Cache[4];
	static bool bTried[4] = { false, false, false, false };
	const int32 I = static_cast<int32>(Mat);
	if (!Cache[I].IsValid())
	{
		UMaterialInterface* M = nullptr;
		if (!bTried[I] || GIsEditor)
		{
			bTried[I] = true;
			switch (Mat)
			{
			case ESRMat::Fx: M = LoadOptionalMaterial(TEXT("/Game/SR/M_SRFx")); break;
			case ESRMat::Slime: M = LoadOptionalMaterial(TEXT("/Game/SR/M_SRSlime")); break;
			case ESRMat::Water: M = LoadOptionalMaterial(TEXT("/Game/SR/M_SRWater")); break;
			default: M = LoadOptionalMaterial(TEXT("/Game/SR/M_SRLit")); break;
			}
		}
		if (!M && Mat != ESRMat::Lit) M = Material(ESRMat::Lit);
		if (!M) M = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
		Cache[I] = M;
	}
	return Cache[I].Get();
}

UMaterialInstanceDynamic* SR::MakeMID(UObject* Outer, const FLinearColor& Color, ESRMat Mat, float Glow)
{
	UMaterialInterface* Parent = Material(Mat);
	if (!Parent) return nullptr;
	UMaterialInstanceDynamic* MID = UMaterialInstanceDynamic::Create(Parent, Outer);
	MID->SetVectorParameterValue(TEXT("Color"), Color);
	MID->SetScalarParameterValue(TEXT("Glow"), Glow);
	return MID;
}

UStaticMeshComponent* SR::AddPart(AActor* Owner, USceneComponent* Parent, const TCHAR* Shape,
	const FVector& Loc, const FVector& Scale, const FLinearColor& Color, const FRotator& Rot, ESRMat Mat, float Glow)
{
	UStaticMeshComponent* C = NewObject<UStaticMeshComponent>(Owner);
	C->SetStaticMesh(Mesh(Shape));
	C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	C->SetCanEverAffectNavigation(false);
	C->SetGenerateOverlapEvents(false);
	C->SetRelativeLocation(Loc);
	C->SetRelativeRotation(Rot);
	C->SetRelativeScale3D(Scale);
	C->SetMaterial(0, MakeMID(C, Color, Mat, Glow));
	if (Mat == ESRMat::Fx) C->SetCastShadow(false);
	C->SetupAttachment(Parent ? Parent : Owner->GetRootComponent());
	C->RegisterComponent();
	return C;
}

USceneComponent* SR::AddPivot(AActor* Owner, USceneComponent* Parent, const FVector& Loc, const FRotator& Rot)
{
	USceneComponent* C = NewObject<USceneComponent>(Owner);
	C->SetRelativeLocation(Loc);
	C->SetRelativeRotation(Rot);
	C->SetupAttachment(Parent ? Parent : Owner->GetRootComponent());
	C->RegisterComponent();
	return C;
}
