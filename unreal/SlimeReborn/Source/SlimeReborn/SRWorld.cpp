#include "SRWorld.h"
#include "SRNPC.h"
#include "SlimeReborn.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/VolumetricCloudComponent.h"
#include "Components/PostProcessComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "ProceduralMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "Engine/World.h"
#include "Engine/CollisionProfile.h"
#include "Engine/StaticMesh.h"
#include "HAL/PlatformTime.h"

ASRWorld::ASRWorld()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickInterval = 0.05f;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;
	Root->SetMobility(EComponentMobility::Static);

	Sun = CreateDefaultSubobject<UDirectionalLightComponent>(TEXT("Sun"));
	Sun->SetupAttachment(Root);
	Sun->SetMobility(EComponentMobility::Movable);
	Sun->Intensity = 9.f;
	Sun->LightColor = FColor(255, 242, 225);
	Sun->LightSourceAngle = 0.6f;
	Sun->bAtmosphereSunLight = true;
	Sun->AtmosphereSunLightIndex = 0;

	Moon = CreateDefaultSubobject<UDirectionalLightComponent>(TEXT("Moon"));
	Moon->SetupAttachment(Root);
	Moon->SetMobility(EComponentMobility::Movable);
	Moon->Intensity = 0.3f;
	Moon->LightColor = FColor(150, 175, 255);
	Moon->bAtmosphereSunLight = true;
	Moon->AtmosphereSunLightIndex = 1;

	Atmosphere = CreateDefaultSubobject<USkyAtmosphereComponent>(TEXT("Atmosphere"));
	Atmosphere->SetupAttachment(Root);

	SkyLight = CreateDefaultSubobject<USkyLightComponent>(TEXT("SkyLight"));
	SkyLight->SetupAttachment(Root);
	SkyLight->SetMobility(EComponentMobility::Movable);
	SkyLight->bRealTimeCapture = true;
	SkyLight->Intensity = 1.f;

	Fog = CreateDefaultSubobject<UExponentialHeightFogComponent>(TEXT("Fog"));
	Fog->SetupAttachment(Root);
	Fog->FogDensity = 0.01f;
	Fog->FogHeightFalloff = 0.06f;
	Fog->bEnableVolumetricFog = true;

	Clouds = CreateDefaultSubobject<UVolumetricCloudComponent>(TEXT("Clouds"));
	Clouds->SetupAttachment(Root);

	PostFX = CreateDefaultSubobject<UPostProcessComponent>(TEXT("PostFX"));
	PostFX->SetupAttachment(Root);
	PostFX->bUnbound = true;
	FPostProcessSettings& S = PostFX->Settings;
	S.bOverride_BloomIntensity = true;            S.BloomIntensity = 0.75f;
	S.bOverride_VignetteIntensity = true;         S.VignetteIntensity = 0.45f;
	S.bOverride_SceneFringeIntensity = true;      S.SceneFringeIntensity = 0.25f;
	S.bOverride_ColorSaturation = true;           S.ColorSaturation = FVector4(1.08f, 1.08f, 1.08f, 1.f);
	S.bOverride_ColorContrast = true;             S.ColorContrast = FVector4(1.06f, 1.06f, 1.06f, 1.f);
	S.bOverride_AutoExposureBias = true;          S.AutoExposureBias = 0.3f;
	S.bOverride_FilmGrainIntensity = true;        S.FilmGrainIntensity = 0.08f;
}

void ASRWorld::BeginPlay()
{
	Super::BeginPlay();
	const double T0 = FPlatformTime::Seconds();

	if (UMaterialInterface* CloudMat = LoadObject<UMaterialInterface>(nullptr,
		TEXT("/Engine/EngineSky/VolumetricClouds/m_SimpleVolumetricCloud_Inst.m_SimpleVolumetricCloud_Inst")))
	{
		Clouds->SetMaterial(CloudMat);
	}

	BuildTerrain();
	BuildWater();
	BuildNature();
	BuildCity();
	BuildLandmarks();
	BuildGraces();
	UpdateSky();

	UE_LOG(LogSlime, Log, TEXT("World built in %.2f s"), FPlatformTime::Seconds() - T0);
}

void ASRWorld::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!bCitizensSpawned)
	{
		bCitizensSpawned = true;
		SpawnCitizens();
	}
	TimeOfDay = FMath::Fmod(TimeOfDay + DeltaSeconds * 24.f / FMath::Max(1.f, DayLengthMinutes * 60.f), 24.f);
	UpdateSky();
}

void ASRWorld::UpdateSky()
{
	const float Phase = (TimeOfDay - 6.f) / 12.f;
	const float Elev = FMath::Sin(Phase * PI);
	Sun->SetWorldRotation(FRotator(-Phase * 180.f, 35.f, 0.f));
	Moon->SetWorldRotation((-Sun->GetForwardVector()).Rotation());
	Sun->SetIntensity(9.f * FMath::Clamp(Elev * 4.f, 0.f, 1.f));
	Moon->SetIntensity(0.35f * FMath::Clamp(-Elev * 4.f, 0.f, 1.f));
	const FLinearColor Warm(1.f, 0.62f, 0.38f);
	const FLinearColor Day(1.f, 0.95f, 0.88f);
	Sun->SetLightColor(FMath::Lerp(Warm, Day, FMath::Clamp(Elev * 2.5f, 0.f, 1.f)));
	Fog->SetFogDensity(0.008f + 0.012f * (1.f - FMath::Clamp(FMath::Abs(Elev) * 3.f, 0.f, 1.f)));

	const bool bNight = IsNight();
	if (bNight != bLastNight)
	{
		bLastNight = bNight;
		for (UPointLightComponent* L : NightLights)
		{
			if (L) L->SetIntensity(bNight ? 9000.f : 0.f);
		}
		for (UMaterialInstanceDynamic* M : NightGlow)
		{
			if (M) M->SetScalarParameterValue(TEXT("Glow"), bNight ? 6.f : 0.3f);
		}
	}
}

// ============================================================================
// Helpers
// ============================================================================

UHierarchicalInstancedStaticMeshComponent* ASRWorld::MakeHISM(const TCHAR* Shape, const FLinearColor& Color, bool bCollide, float CullEnd, ESRMat Mat, float Glow)
{
	UHierarchicalInstancedStaticMeshComponent* H = NewObject<UHierarchicalInstancedStaticMeshComponent>(this);
	H->SetStaticMesh(SR::Mesh(Shape));
	H->SetMaterial(0, SR::MakeMID(H, Color, Mat, Glow));
	H->SetCollisionProfileName(bCollide ? UCollisionProfile::BlockAll_ProfileName : UCollisionProfile::NoCollision_ProfileName);
	H->SetCanEverAffectNavigation(false);
	if (CullEnd > 0.f)
	{
		H->SetCullDistances(static_cast<int32>(CullEnd * 0.7f), static_cast<int32>(CullEnd));
		H->SetCastShadow(CullEnd > 9000.f);
	}
	if (Mat == ESRMat::Fx) H->SetCastShadow(false);
	H->SetupAttachment(Root);
	H->RegisterComponent();
	return H;
}

void ASRWorld::AddBox(UHierarchicalInstancedStaticMeshComponent* H, const FTransform& Parent, const FVector& Loc, const FVector& SizeCm, const FRotator& Rot)
{
	const FTransform Local(Rot, Loc, SizeCm / 100.f);
	H->AddInstance(Local * Parent);
}

void ASRWorld::AddLamp(const FVector& Base, bool bLight)
{
	PostHISM->AddInstance(FTransform(FRotator::ZeroRotator, Base + FVector(0, 0, 210), FVector(0.16f, 0.16f, 4.2f)));
	LampHISM->AddInstance(FTransform(FRotator::ZeroRotator, Base + FVector(0, 0, 440), FVector(0.45f)));
	if (bLight)
	{
		UPointLightComponent* L = NewObject<UPointLightComponent>(this);
		L->SetMobility(EComponentMobility::Movable);
		L->SetRelativeLocation(Base + FVector(0, 0, 430));
		L->SetIntensity(0.f);
		L->SetAttenuationRadius(1700.f);
		L->SetLightColor(FLinearColor(1.f, 0.7f, 0.42f));
		L->SetCastShadows(false);
		L->SetupAttachment(Root);
		L->RegisterComponent();
		NightLights.Add(L);
	}
}

// ============================================================================
// Terrain
// ============================================================================

static int32 PickSection(const FVector& P, float Nz)
{
	if (FMath::Sqrt(P.X * P.X + P.Y * P.Y) < SR::CityR + 350.f) return 5;
	if (P.Z < 110.f) return 4;
	if (Nz < 0.72f) return 2;
	if (P.Z > SR::SnowZ + SR::Noise2(P.X * 0.0004f, P.Y * 0.0004f) * 700.f) return 3;
	switch (SR::BiomeAt(P.X, P.Y))
	{
	case 1: case 5: return 1;
	case 2: return Nz < 0.93f ? 6 : 4;
	case 3: return Nz < 0.86f ? 2 : 0;
	default: return 0;
	}
}

void ASRWorld::BuildTerrain()
{
	constexpr int32 NumChunks = 10;
	constexpr int32 NumSections = 7;
	const int32 Q = FMath::Clamp(TerrainQuadsPerChunk, 8, 128);
	const float ChunkSize = 2.f * SR::WorldHalf / NumChunks;
	const float Step = ChunkSize / Q;
	const int32 W = Q + 1;

	//                                         grass     dark      rock      snow      sand      cobble    clay
	static const uint32 Colors[NumSections] = { 0x5a8239, 0x30502a, 0x6f675f, 0xeaf0f6, 0xcfb27a, 0x7a736a, 0x9c5a3a };
	static const float Rough[NumSections] = { 0.85f, 0.9f, 0.75f, 0.5f, 0.95f, 0.9f, 0.9f };
	UMaterialInstanceDynamic* Mats[NumSections];
	for (int32 i = 0; i < NumSections; ++i)
	{
		Mats[i] = SR::MakeMID(this, SR::Hex(Colors[i]));
		if (Mats[i])
		{
			Mats[i]->SetScalarParameterValue(TEXT("Roughness"), Rough[i]);
			Mats[i]->SetScalarParameterValue(TEXT("Variation"), i == 3 ? 0.08f : 0.25f);
		}
	}

	struct FSection
	{
		TArray<FVector> V;
		TArray<int32> T;
		TArray<FVector> N;
		TArray<FVector2D> UV;
		TMap<int32, int32> Map;
	};

	TArray<FVector> GP, GN;
	GP.SetNum(W * W);
	GN.SetNum(W * W);

	for (int32 CX = 0; CX < NumChunks; ++CX)
	{
		for (int32 CY = 0; CY < NumChunks; ++CY)
		{
			const float X0 = -SR::WorldHalf + CX * ChunkSize;
			const float Y0 = -SR::WorldHalf + CY * ChunkSize;
			for (int32 i = 0; i < W; ++i)
			{
				for (int32 j = 0; j < W; ++j)
				{
					const float X = X0 + i * Step;
					const float Y = Y0 + j * Step;
					GP[i * W + j] = FVector(X, Y, SR::HeightAt(X, Y));
					GN[i * W + j] = SR::NormalAt(X, Y);
				}
			}

			FSection Sec[NumSections];
			auto Emit = [&GP, &GN](FSection& S, int32 G)
			{
				if (const int32* Found = S.Map.Find(G))
				{
					S.T.Add(*Found);
					return;
				}
				const int32 Idx = S.V.Add(GP[G]);
				S.N.Add(GN[G]);
				S.UV.Add(FVector2D(GP[G].X / 1000.f, GP[G].Y / 1000.f));
				S.Map.Add(G, Idx);
				S.T.Add(Idx);
			};

			for (int32 i = 0; i < Q; ++i)
			{
				for (int32 j = 0; j < Q; ++j)
				{
					const int32 A = i * W + j, B = i * W + j + 1, C = (i + 1) * W + j, D = (i + 1) * W + j + 1;
					// Clockwise seen from above (+Z) = front face in Unreal.
					const int32 Tris[2][3] = { { A, B, C }, { B, D, C } };
					for (const auto& Tri : Tris)
					{
						const FVector P = (GP[Tri[0]] + GP[Tri[1]] + GP[Tri[2]]) / 3.f;
						const float Nz = (GN[Tri[0]].Z + GN[Tri[1]].Z + GN[Tri[2]].Z) / 3.f;
						FSection& S = Sec[PickSection(P, Nz)];
						Emit(S, Tri[0]);
						Emit(S, Tri[1]);
						Emit(S, Tri[2]);
					}
				}
			}

			UProceduralMeshComponent* PMC = NewObject<UProceduralMeshComponent>(this);
			PMC->bUseAsyncCooking = false;
			PMC->SetupAttachment(Root);
			PMC->RegisterComponent();
			PMC->SetCollisionProfileName(UCollisionProfile::BlockAll_ProfileName);
			int32 SectionIndex = 0;
			for (int32 s = 0; s < NumSections; ++s)
			{
				if (Sec[s].T.Num() == 0) continue;
				PMC->CreateMeshSection(SectionIndex, Sec[s].V, Sec[s].T, Sec[s].N, Sec[s].UV, TArray<FColor>(), TArray<FProcMeshTangent>(), true);
				PMC->SetMaterial(SectionIndex, Mats[s]);
				++SectionIndex;
			}
		}
	}
}

void ASRWorld::BuildWater()
{
	const float Size = SR::WorldHalf * 3.2f / 100.f;
	UStaticMeshComponent* Sea = SR::AddPart(this, Root, TEXT("Plane"), FVector(0, 0, SR::WaterZ), FVector(Size, Size, 1.f),
		SR::Hex(0x1d4f66), ESRMat::Water);
	if (UMaterialInstanceDynamic* M = Cast<UMaterialInstanceDynamic>(Sea->GetMaterial(0)))
	{
		M->SetScalarParameterValue(TEXT("Roughness"), 0.05f);
		M->SetScalarParameterValue(TEXT("Opacity"), 0.82f);
	}
	Sea->SetCastShadow(false);
}

// ============================================================================
// Vegetation & rocks
// ============================================================================

void ASRWorld::BuildNature()
{
	using HISM = UHierarchicalInstancedStaticMeshComponent;
	FRandomStream R(1337);
	TMap<HISM*, TArray<FTransform>> Batch;
	auto Put = [&Batch](HISM* H, const FTransform& T) { Batch.FindOrAdd(H).Add(T); };

	HISM* Trunk = MakeHISM(TEXT("Cylinder"), SR::Hex(0x5b3f2a), true);
	HISM* DeadTrunk = MakeHISM(TEXT("Cylinder"), SR::Hex(0x4a4038), true);
	HISM* Pine = MakeHISM(TEXT("Cone"), SR::Hex(0x23422a), false);
	HISM* PineSnow = MakeHISM(TEXT("Cone"), SR::Hex(0x5f7468), false);
	HISM* Leaf = MakeHISM(TEXT("Sphere"), SR::Hex(0x45732e), false);
	HISM* LeafDark = MakeHISM(TEXT("Sphere"), SR::Hex(0x2b4b25), false);
	HISM* LeafAutumn = MakeHISM(TEXT("Sphere"), SR::Hex(0xa86b24), false);
	HISM* Cactus = MakeHISM(TEXT("Cylinder"), SR::Hex(0x4d6e36), true);
	HISM* Rock = MakeHISM(TEXT("Sphere"), SR::Hex(0x7c766d), true);
	HISM* RockDark = MakeHISM(TEXT("Sphere"), SR::Hex(0x585149), true);
	HISM* Grass = MakeHISM(TEXT("Cone"), SR::Hex(0x6c973a), false, 7500.f);
	HISM* GrassDry = MakeHISM(TEXT("Cone"), SR::Hex(0xa49a57), false, 7500.f);
	HISM* FlowerR = MakeHISM(TEXT("Sphere"), SR::Hex(0xc8323c), false, 5000.f);
	HISM* FlowerY = MakeHISM(TEXT("Sphere"), SR::Hex(0xf0c23a), false, 5000.f);
	HISM* FlowerW = MakeHISM(TEXT("Sphere"), SR::Hex(0xeeeef2), false, 5000.f);
	HISM* Bush = MakeHISM(TEXT("Sphere"), SR::Hex(0x3a6327), false, 14000.f);

	const float Lim = SR::WorldHalf * 0.82f;
	auto CityClear = [](float X, float Y, float Extra) { return X * X + Y * Y < FMath::Square(SR::CityR + Extra); };

	// ---- Trees ----
	const int32 NumTrees = FMath::RoundToInt(20000 * FoliageDensity);
	for (int32 n = 0; n < NumTrees; ++n)
	{
		const float X = R.FRandRange(-Lim, Lim), Y = R.FRandRange(-Lim, Lim);
		if (CityClear(X, Y, 1500.f)) continue;
		const float Z = SR::HeightAt(X, Y);
		if (Z < 160.f || Z > SR::SnowZ + 500.f) continue;
		if (SR::NormalAt(X, Y).Z < 0.8f) continue;
		const int32 Biome = SR::BiomeAt(X, Y);
		static const float Prob[6] = { 0.16f, 0.95f, 0.05f, 0.5f, 0.3f, 0.55f };
		const float Clump = FMath::Clamp(0.55f + SR::Noise2(X * 0.00006f, Y * 0.00006f) * 0.9f, 0.05f, 1.4f);
		if (R.FRand() > Prob[Biome] * Clump) continue;

		const float Yaw = R.FRandRange(0.f, 360.f);
		float Ht = R.FRandRange(900.f, 1700.f) * (Biome == 1 ? 1.35f : 1.f);
		const float Rad = Ht * 0.032f;
		const bool bSnowy = Z > SR::SnowZ - 600.f;

		if (Biome == 2)
		{
			if (R.FRand() < 0.6f)
			{
				const float CH = R.FRandRange(250.f, 550.f);
				Put(Cactus, FTransform(FRotator(0, Yaw, 0), FVector(X, Y, Z + CH * 0.5f - 20.f), FVector(0.5f, 0.5f, CH / 100.f)));
				Put(Cactus, FTransform(FRotator(0, Yaw, 0), FVector(X + 40.f, Y, Z + CH * 0.6f), FVector(0.3f, 0.3f, CH / 250.f)));
			}
			else
			{
				Put(DeadTrunk, FTransform(FRotator(R.FRandRange(-8.f, 8.f), Yaw, 0), FVector(X, Y, Z + Ht * 0.3f), FVector(Rad / 50.f, Rad / 50.f, Ht * 0.6f / 100.f)));
			}
			continue;
		}
		if (Biome == 5 && R.FRand() < 0.45f)
		{
			Put(DeadTrunk, FTransform(FRotator(R.FRandRange(-12.f, 12.f), Yaw, R.FRandRange(-12.f, 12.f)), FVector(X, Y, Z + Ht * 0.3f), FVector(Rad / 50.f, Rad / 50.f, Ht * 0.6f / 100.f)));
			continue;
		}

		const bool bPine = Biome == 3 || (Biome == 1 && R.FRand() < 0.45f) || (Biome == 0 && R.FRand() < 0.15f);
		if (bPine)
		{
			Put(Trunk, FTransform(FRotator(0, Yaw, 0), FVector(X, Y, Z + Ht * 0.22f), FVector(Rad / 50.f, Rad / 50.f, Ht * 0.48f / 100.f)));
			HISM* Crown = bSnowy ? PineSnow : Pine;
			Put(Crown, FTransform(FRotator(0, Yaw, 0), FVector(X, Y, Z + Ht * 0.48f), FVector(Ht * 0.42f / 100.f, Ht * 0.42f / 100.f, Ht * 0.6f / 100.f)));
			Put(Crown, FTransform(FRotator(0, Yaw + 30.f, 0), FVector(X, Y, Z + Ht * 0.74f), FVector(Ht * 0.3f / 100.f, Ht * 0.3f / 100.f, Ht * 0.45f / 100.f)));
			Put(Crown, FTransform(FRotator(0, Yaw + 60.f, 0), FVector(X, Y, Z + Ht * 0.93f), FVector(Ht * 0.17f / 100.f, Ht * 0.17f / 100.f, Ht * 0.26f / 100.f)));
		}
		else
		{
			Ht *= 0.85f;
			Put(Trunk, FTransform(FRotator(R.FRandRange(-4.f, 4.f), Yaw, 0), FVector(X, Y, Z + Ht * 0.3f), FVector(Rad / 45.f, Rad / 45.f, Ht * 0.62f / 100.f)));
			HISM* Crown = Biome == 1 ? LeafDark : (R.FRand() < 0.12f ? LeafAutumn : Leaf);
			const float CR = Ht * R.FRandRange(0.45f, 0.6f);
			Put(Crown, FTransform(FRotator(0, Yaw, 0), FVector(X, Y, Z + Ht * 0.72f), FVector(CR / 100.f, CR / 100.f, CR * 0.8f / 100.f)));
			const FVector Off = FRotator(0, Yaw, 0).Vector() * CR * 0.35f;
			Put(Crown, FTransform(FRotator(0, Yaw, 0), FVector(X + Off.X, Y + Off.Y, Z + Ht * 0.62f), FVector(CR * 0.7f / 100.f, CR * 0.7f / 100.f, CR * 0.55f / 100.f)));
			Put(Crown, FTransform(FRotator(0, Yaw, 0), FVector(X - Off.Y, Y + Off.X, Z + Ht * 0.86f), FVector(CR * 0.55f / 100.f, CR * 0.55f / 100.f, CR * 0.45f / 100.f)));
		}
		if (R.FRand() < 0.3f)
		{
			const float BR = R.FRandRange(120.f, 260.f);
			Put(Bush, FTransform(FRotator(0, Yaw, 0), FVector(X + R.FRandRange(-500.f, 500.f), Y + R.FRandRange(-500.f, 500.f), Z + BR * 0.25f), FVector(BR / 100.f, BR / 100.f, BR * 0.6f / 100.f)));
		}
	}

	// ---- Rocks & boulders ----
	const int32 NumRocks = FMath::RoundToInt(4500 * FoliageDensity);
	for (int32 n = 0; n < NumRocks; ++n)
	{
		const float X = R.FRandRange(-Lim, Lim), Y = R.FRandRange(-Lim, Lim);
		if (CityClear(X, Y, 1000.f)) continue;
		const float Z = SR::HeightAt(X, Y);
		if (Z < -100.f) continue;
		const int32 Biome = SR::BiomeAt(X, Y);
		if (Biome != 3 && Biome != 2 && R.FRand() < 0.5f) continue;
		const float S = R.FRandRange(120.f, Biome == 3 ? 1100.f : 600.f);
		const FVector Scale(S / 100.f * R.FRandRange(0.8f, 1.4f), S / 100.f * R.FRandRange(0.8f, 1.3f), S / 100.f * R.FRandRange(0.45f, 0.9f));
		Put(R.FRand() < 0.5f ? Rock : RockDark, FTransform(FRotator(R.FRandRange(-20.f, 20.f), R.FRandRange(0.f, 360.f), R.FRandRange(-20.f, 20.f)), FVector(X, Y, Z + S * 0.1f), Scale));
	}

	// ---- Grass & flowers ----
	const int32 NumGrass = FMath::RoundToInt(90000 * FoliageDensity);
	for (int32 n = 0; n < NumGrass; ++n)
	{
		const float X = R.FRandRange(-Lim, Lim), Y = R.FRandRange(-Lim, Lim);
		if (CityClear(X, Y, 400.f)) continue;
		const int32 Biome = SR::BiomeAt(X, Y);
		if (Biome == 2 && R.FRand() < 0.85f) continue;
		const float Field = SR::Noise2(X * 0.0002f, Y * 0.0002f);
		if (Field < -0.25f) continue;
		const float Z = SR::HeightAt(X, Y);
		if (Z < 150.f || Z > SR::SnowZ - 800.f) continue;
		if (SR::NormalAt(X, Y).Z < 0.86f) continue;
		// A tuft = 3 blades
		HISM* H = (Biome == 2 || (Biome == 4 && Field > 0.4f)) ? GrassDry : Grass;
		for (int32 b = 0; b < 3; ++b)
		{
			const float BX = X + R.FRandRange(-40.f, 40.f), BY = Y + R.FRandRange(-40.f, 40.f);
			const float BH = R.FRandRange(45.f, 95.f);
			Put(H, FTransform(FRotator(R.FRandRange(-14.f, 14.f), R.FRandRange(0.f, 360.f), R.FRandRange(-14.f, 14.f)),
				FVector(BX, BY, Z + BH * 0.4f), FVector(0.1f, 0.1f, BH / 100.f)));
		}
		if ((Biome == 0 || Biome == 4) && R.FRand() < 0.12f)
		{
			const float Pick = R.FRand();
			HISM* F = Pick < 0.4f ? FlowerY : (Pick < 0.75f ? FlowerW : FlowerR);
			Put(F, FTransform(FRotator::ZeroRotator, FVector(X + 30.f, Y, Z + 45.f), FVector(0.16f)));
		}
	}

	for (TPair<HISM*, TArray<FTransform>>& Pair : Batch)
	{
		Pair.Key->AddInstances(Pair.Value, false);
	}
}

// ============================================================================
// Altheria, the royal city
// ============================================================================

void ASRWorld::BuildCity()
{
	using HISM = UHierarchicalInstancedStaticMeshComponent;
	const float Z = SR::CityZ;
	const FTransform Id = FTransform::Identity;
	FRandomStream R(4242);

	HISM* Stone = MakeHISM(TEXT("Cube"), SR::Hex(0x938c80), true);
	HISM* StoneDark = MakeHISM(TEXT("Cube"), SR::Hex(0x6a645b), true);
	HISM* StoneLight = MakeHISM(TEXT("Cube"), SR::Hex(0xc9c2b4), true);
	HISM* TowerCyl = MakeHISM(TEXT("Cylinder"), SR::Hex(0x8c867a), true);
	HISM* TowerRoof = MakeHISM(TEXT("Cone"), SR::Hex(0x34465e), true);
	HISM* GoldCone = MakeHISM(TEXT("Cone"), SR::Hex(0xc9a227), true);
	HISM* Road = MakeHISM(TEXT("Cube"), SR::Hex(0x5f5951), false);
	HISM* Beam = MakeHISM(TEXT("Cube"), SR::Hex(0x4a3020), false);
	HISM* Door = MakeHISM(TEXT("Cube"), SR::Hex(0x3a2616), false);
	HISM* Gold = MakeHISM(TEXT("Cube"), SR::Hex(0xc9a227), false);
	HISM* Banner = MakeHISM(TEXT("Cube"), SR::Hex(0x8c1c1c), false);
	HISM* Wood = MakeHISM(TEXT("Cube"), SR::Hex(0x8a6a45), true);
	HISM* Window = MakeHISM(TEXT("Cube"), SR::Hex(0xffc46b), false, 0.f, ESRMat::Fx, 0.3f);
	if (UMaterialInstanceDynamic* M = Cast<UMaterialInstanceDynamic>(Window->GetMaterial(0))) NightGlow.Add(M);
	PostHISM = MakeHISM(TEXT("Cylinder"), SR::Hex(0x2a2a2c), true);
	LampHISM = MakeHISM(TEXT("Sphere"), SR::Hex(0xffc878), false, 0.f, ESRMat::Fx, 0.3f);
	if (UMaterialInstanceDynamic* M = Cast<UMaterialInstanceDynamic>(LampHISM->GetMaterial(0))) NightGlow.Add(M);

	HISM* HouseWalls[4] = {
		MakeHISM(TEXT("Cube"), SR::Hex(0xd9c9a6), true), MakeHISM(TEXT("Cube"), SR::Hex(0xe6e0d3), true),
		MakeHISM(TEXT("Cube"), SR::Hex(0xa07a52), true), MakeHISM(TEXT("Cube"), SR::Hex(0xa49b8b), true) };
	HISM* Roofs[4] = {
		MakeHISM(TEXT("Cube"), SR::Hex(0x9e4b2f), true), MakeHISM(TEXT("Cube"), SR::Hex(0x3d4553), true),
		MakeHISM(TEXT("Cube"), SR::Hex(0x6d4b33), true), MakeHISM(TEXT("Cube"), SR::Hex(0x7e3a2a), true) };

	auto Gable = [&](HISM* H, const FTransform& T, float Top, float Len, float Width)
	{
		const float S = Width / 1.4142f + 70.f;
		AddBox(H, T, FVector(0, 0, Top), FVector(Len + 140.f, S, S), FRotator(0, 0, 45.f));
	};

	// ---- Streets ----
	const float WR = SR::CityR - 300.f;
	AddBox(Road, Id, FVector(-WR * 0.5f, 0, Z + 2.f), FVector(WR, 1700.f, 6.f));
	AddBox(Road, Id, FVector(0, 0, Z + 2.f), FVector(1700.f, 2.f * WR, 6.f));
	AddBox(Road, Id, FVector(3200.f, 0, Z + 2.f), FVector(6400.f, 1400.f, 6.f));
	for (int32 s = 0; s < 40; ++s)
	{
		const float A = s / 40.f * 360.f;
		const FVector P = FRotator(0, A, 0).Vector() * 3700.f;
		AddBox(Road, Id, FVector(P.X, P.Y, Z + 3.f), FVector(620.f, 900.f, 6.f), FRotator(0, A + 90.f, 0));
	}

	// ---- City walls with towers and three gates (north is the castle) ----
	const float GateAngles[3] = { 180.f, 90.f, 270.f };
	auto NearGate = [&GateAngles](float A, float Tol)
	{
		for (float G : GateAngles)
		{
			if (FMath::Abs(FMath::FindDeltaAngleDegrees(A, G)) < Tol) return true;
		}
		return false;
	};
	constexpr int32 NSeg = 64;
	for (int32 s = 0; s < NSeg; ++s)
	{
		const float A = (s + 0.5f) / NSeg * 360.f;
		if (NearGate(A, 4.5f)) continue;
		const FVector Dir = FRotator(0, A, 0).Vector();
		const FVector Tan(-Dir.Y, Dir.X, 0.f);
		const FVector P = Dir * WR;
		AddBox(Stone, Id, FVector(P.X, P.Y, Z + 550.f), FVector(1120.f, 320.f, 1100.f), FRotator(0, A + 90.f, 0));
		AddBox(StoneDark, Id, FVector(P.X, P.Y, Z + 1110.f) - Dir * 60.f, FVector(1120.f, 120.f, 40.f), FRotator(0, A + 90.f, 0));
		for (int32 k = 0; k < 4; ++k)
		{
			const FVector M = P + Tan * (k * 270.f - 405.f) + Dir * 130.f;
			AddBox(StoneDark, Id, FVector(M.X, M.Y, Z + 1150.f), FVector(120.f, 70.f, 110.f), FRotator(0, A + 90.f, 0));
		}
		if (s % 8 == 4 && !NearGate(A, 12.f))
		{
			AddBox(TowerCyl, Id, FVector(P.X, P.Y, Z + 800.f), FVector(620.f, 620.f, 1600.f));
			AddBox(TowerRoof, Id, FVector(P.X, P.Y, Z + 1600.f + 260.f), FVector(780.f, 780.f, 520.f));
		}
	}
	for (float G : GateAngles)
	{
		const FVector Dir = FRotator(0, G, 0).Vector();
		for (int32 Side = -1; Side <= 1; Side += 2)
		{
			const FVector P = FRotator(0, G + Side * 5.6f, 0).Vector() * WR;
			AddBox(TowerCyl, Id, FVector(P.X, P.Y, Z + 900.f), FVector(720.f, 720.f, 1800.f));
			AddBox(TowerRoof, Id, FVector(P.X, P.Y, Z + 1800.f + 320.f), FVector(880.f, 880.f, 640.f));
		}
		const FVector P = Dir * WR;
		AddBox(Stone, Id, FVector(P.X, P.Y, Z + 980.f), FVector(1300.f, 380.f, 260.f), FRotator(0, G + 90.f, 0));
		const FVector B = Dir * (WR + 200.f);
		AddBox(Banner, Id, FVector(B.X, B.Y, Z + 760.f), FVector(320.f, 16.f, 520.f), FRotator(0, G + 90.f, 0));
		AddBox(Gold, Id, FVector(B.X, B.Y, Z + 1030.f) + Dir * 12.f, FVector(360.f, 10.f, 30.f), FRotator(0, G + 90.f, 0));
	}

	// ---- Fountain plaza ----
	SR::AddPart(this, Root, TEXT("Cylinder"), FVector(0, 0, Z + 40.f), FVector(13.f, 13.f, 0.8f), SR::Hex(0xb8b1a3));
	SR::AddPart(this, Root, TEXT("Cylinder"), FVector(0, 0, Z + 78.f), FVector(12.f, 12.f, 0.1f), SR::Hex(0x2a7fa8), FRotator::ZeroRotator, ESRMat::Water);
	SR::AddPart(this, Root, TEXT("Cylinder"), FVector(0, 0, Z + 240.f), FVector(1.3f, 1.3f, 3.2f), SR::Hex(0xc9c2b4));
	SR::AddPart(this, Root, TEXT("Cylinder"), FVector(0, 0, Z + 400.f), FVector(4.5f, 4.5f, 0.4f), SR::Hex(0xc9c2b4));
	SR::AddPart(this, Root, TEXT("Sphere"), FVector(0, 0, Z + 560.f), FVector(1.3f), FLinearColor(0.3f, 0.85f, 1.f), FRotator(0, 0, 0), ESRMat::Fx, 8.f);
	{
		UPointLightComponent* L = NewObject<UPointLightComponent>(this);
		L->SetMobility(EComponentMobility::Movable);
		L->SetRelativeLocation(FVector(0, 0, Z + 600.f));
		L->SetIntensity(6000.f);
		L->SetAttenuationRadius(2400.f);
		L->SetLightColor(FLinearColor(0.35f, 0.8f, 1.f));
		L->SetCastShadows(false);
		L->SetupAttachment(Root);
		L->RegisterComponent();
	}
	for (int32 s = 0; s < 8; ++s)
	{
		const FVector P = FRotator(0, s * 45.f + 22.5f, 0).Vector() * 2300.f;
		AddLamp(FVector(P.X, P.Y, Z), true);
	}

	// Market stalls around the plaza
	static const uint32 Canopies[6] = { 0xb03a2e, 0x2e6fb0, 0xd9a520, 0x3a8f4a, 0x8e3fa8, 0xe8e2d0 };
	for (int32 s = 0; s < 12; ++s)
	{
		const float A = s * 30.f + 15.f;
		if (FMath::Abs(FMath::FindDeltaAngleDegrees(A, 0.f)) < 20.f) continue;
		const FVector P = FRotator(0, A, 0).Vector() * 2850.f;
		const FTransform T(FRotator(0, A + 90.f, 0), FVector(P.X, P.Y, Z));
		AddBox(Wood, T, FVector(0, 0, 55.f), FVector(480.f, 200.f, 110.f));
		AddBox(Beam, T, FVector(-220.f, 90.f, 160.f), FVector(16.f, 16.f, 320.f));
		AddBox(Beam, T, FVector(220.f, 90.f, 160.f), FVector(16.f, 16.f, 320.f));
		AddBox(Beam, T, FVector(-220.f, -90.f, 130.f), FVector(16.f, 16.f, 260.f));
		AddBox(Beam, T, FVector(220.f, -90.f, 130.f), FVector(16.f, 16.f, 260.f));
		const FVector CL = T.TransformPosition(FVector(0, 0, 300.f));
		SR::AddPart(this, Root, TEXT("Cube"), CL, FVector(5.4f, 2.6f, 0.08f), SR::Hex(Canopies[s % 6]), FRotator(0, A + 90.f, 0) + FRotator(0, 0, -9.f));
		AddBox(Gold, T, FVector(-120.f, 0, 125.f), FVector(60.f, 60.f, 30.f));
		AddBox(Door, T, FVector(120.f, 30.f, 130.f), FVector(80.f, 80.f, 40.f));
	}

	// ---- Royal castle (north) ----
	{
		const FVector C(7900.f, 0.f, Z);
		AddBox(StoneLight, Id, C + FVector(0, 0, 1300.f), FVector(2600.f, 3000.f, 2600.f));
		AddBox(StoneLight, Id, C + FVector(300.f, 0, 2900.f), FVector(1500.f, 1700.f, 700.f));
		AddBox(TowerRoof, Id, C + FVector(300.f, 0, 3250.f), FVector(1100.f, 1100.f, 40.f));
		AddBox(TowerCyl, Id, C + FVector(300.f, 0, 3800.f), FVector(700.f, 700.f, 1100.f));
		AddBox(GoldCone, Id, C + FVector(300.f, 0, 4350.f + 450.f), FVector(900.f, 900.f, 900.f));
		const FVector Corners[4] = { FVector(-1300.f, -1500.f, 0), FVector(-1300.f, 1500.f, 0), FVector(1300.f, -1500.f, 0), FVector(1300.f, 1500.f, 0) };
		for (const FVector& K : Corners)
		{
			AddBox(TowerCyl, Id, C + K + FVector(0, 0, 1650.f), FVector(800.f, 800.f, 3300.f));
			AddBox(TowerRoof, Id, C + K + FVector(0, 0, 3300.f + 450.f), FVector(1000.f, 1000.f, 900.f));
		}
		AddBox(Door, Id, C + FVector(-1310.f, 0, 450.f), FVector(20.f, 640.f, 900.f));
		AddBox(Gold, Id, C + FVector(-1318.f, 0, 930.f), FVector(16.f, 720.f, 60.f));
		for (int32 Side = -1; Side <= 1; Side += 2)
		{
			AddBox(Banner, Id, C + FVector(-1315.f, Side * 950.f, 1700.f), FVector(14.f, 320.f, 1000.f));
			AddBox(Gold, Id, C + FVector(-1322.f, Side * 950.f, 1900.f), FVector(10.f, 120.f, 120.f));
		}
		for (int32 Step = 0; Step < 4; ++Step)
		{
			AddBox(StoneLight, Id, C + FVector(-1450.f - Step * 120.f, 0, 30.f + (3 - Step) * 45.f), FVector(240.f, 1100.f, 90.f));
		}
		for (int32 W = 0; W < 5; ++W)
		{
			AddBox(Window, Id, C + FVector(-1305.f, -1000.f + W * 500.f, 1500.f), FVector(12.f, 140.f, 240.f));
			AddBox(Window, Id, C + FVector(-1305.f, -1000.f + W * 500.f, 2150.f), FVector(12.f, 140.f, 240.f));
		}
	}

	// ---- Cathedral (north-east) ----
	{
		const FVector C(4700.f, 5200.f, Z);
		AddBox(StoneLight, Id, C + FVector(0, 0, 950.f), FVector(3800.f, 1700.f, 1900.f));
		Gable(Roofs[1], FTransform(C), 1900.f, 3800.f, 1700.f);
		AddBox(StoneLight, Id, C + FVector(-2300.f, 0, 2200.f), FVector(1000.f, 1000.f, 4400.f));
		AddBox(TowerRoof, Id, C + FVector(-2300.f, 0, 4400.f + 900.f), FVector(1150.f, 1150.f, 1800.f));
		AddBox(Gold, Id, C + FVector(-2300.f, 0, 6300.f), FVector(40.f, 40.f, 400.f));
		AddBox(Gold, Id, C + FVector(-2300.f, 0, 6380.f), FVector(40.f, 220.f, 40.f));
		AddBox(Window, Id, C + FVector(-2805.f, 0, 2900.f), FVector(12.f, 420.f, 420.f));
		AddBox(Door, Id, C + FVector(-2805.f, 0, 380.f), FVector(14.f, 420.f, 760.f));
		for (int32 W = 0; W < 6; ++W)
		{
			for (int32 Side = -1; Side <= 1; Side += 2)
			{
				AddBox(Window, Id, C + FVector(-1500.f + W * 600.f, Side * 856.f, 1100.f), FVector(160.f, 12.f, 520.f));
				AddBox(StoneDark, Id, C + FVector(-1800.f + W * 600.f, Side * 900.f, 900.f), FVector(140.f, 100.f, 1800.f));
			}
		}
	}

	// ---- Adventurers' Guild (south-west) ----
	{
		const FVector C(-2900.f, -4700.f, Z);
		AddBox(HouseWalls[3], Id, C + FVector(0, 0, 650.f), FVector(2200.f, 2600.f, 1300.f));
		AddBox(HouseWalls[0], Id, C + FVector(0, 0, 1300.f + 450.f), FVector(2400.f, 2800.f, 900.f));
		AddBox(Beam, Id, C + FVector(0, 0, 1300.f), FVector(2480.f, 2880.f, 40.f));
		Gable(Roofs[2], FTransform(FRotator(0, 90.f, 0), C), 2200.f, 2800.f, 2400.f);
		AddBox(Door, Id, C + FVector(0, 1310.f, 400.f), FVector(500.f, 16.f, 800.f));
		AddBox(Gold, Id, C + FVector(0, 1330.f, 980.f), FVector(900.f, 14.f, 220.f));
		AddBox(Banner, Id, C + FVector(-700.f, 1330.f, 1700.f), FVector(220.f, 12.f, 600.f));
		AddBox(Banner, Id, C + FVector(700.f, 1330.f, 1700.f), FVector(220.f, 12.f, 600.f));
		for (int32 W = 0; W < 4; ++W)
		{
			AddBox(Window, Id, C + FVector(-900.f + W * 600.f, 1408.f, 1750.f), FVector(160.f, 12.f, 200.f));
		}
	}

	// ---- Blacksmith (forge with glowing furnace) ----
	{
		const FVector C(3000.f, -3900.f, Z);
		AddBox(HouseWalls[3], Id, C + FVector(0, 0, 400.f), FVector(1600.f, 1500.f, 800.f));
		Gable(Roofs[1], FTransform(C), 800.f, 1600.f, 1500.f);
		AddBox(StoneDark, Id, C + FVector(500.f, 400.f, 1100.f), FVector(220.f, 220.f, 900.f));
		AddBox(Wood, Id, C + FVector(-300.f, 1050.f, 120.f), FVector(900.f, 300.f, 20.f));
		AddBox(StoneDark, Id, C + FVector(-300.f, 1150.f, 60.f), FVector(160.f, 80.f, 120.f));
		SR::AddPart(this, Root, TEXT("Sphere"), C + FVector(300.f, 760.f, 120.f), FVector(1.4f, 1.4f, 0.9f), FLinearColor(1.f, 0.35f, 0.05f), FRotator::ZeroRotator, ESRMat::Fx, 12.f);
		UPointLightComponent* L = NewObject<UPointLightComponent>(this);
		L->SetMobility(EComponentMobility::Movable);
		L->SetRelativeLocation(C + FVector(300.f, 900.f, 200.f));
		L->SetIntensity(9000.f);
		L->SetAttenuationRadius(1500.f);
		L->SetLightColor(FLinearColor(1.f, 0.4f, 0.1f));
		L->SetCastShadows(false);
		L->SetupAttachment(Root);
		L->RegisterComponent();
	}

	// ---- Tavern "Il Drago Dormiente" (north-west) ----
	{
		const FVector C(-3000.f, 4300.f, Z);
		AddBox(HouseWalls[2], Id, C + FVector(0, 0, 500.f), FVector(2400.f, 1800.f, 1000.f));
		AddBox(HouseWalls[0], Id, C + FVector(0, 0, 1000.f + 400.f), FVector(2500.f, 1900.f, 800.f));
		Gable(Roofs[0], FTransform(C), 1800.f, 2500.f, 1900.f);
		AddBox(Door, Id, C + FVector(0, -910.f, 380.f), FVector(380.f, 16.f, 760.f));
		AddBox(Gold, Id, C + FVector(700.f, -1000.f, 900.f), FVector(300.f, 12.f, 200.f));
		for (int32 W = 0; W < 4; ++W)
		{
			AddBox(Window, Id, C + FVector(-900.f + W * 600.f, -958.f, 1400.f), FVector(160.f, 12.f, 220.f));
			AddBox(Window, Id, C + FVector(-900.f + W * 600.f, -908.f, 520.f), FVector(160.f, 12.f, 200.f));
		}
	}

	// ---- Houses ----
	TArray<FBox2D> Reserved;
	Reserved.Add(FBox2D(FVector2D(5800.f, -3700.f), FVector2D(10800.f, 3700.f)));
	Reserved.Add(FBox2D(FVector2D(1900.f, 4000.f), FVector2D(7000.f, 6400.f)));
	Reserved.Add(FBox2D(FVector2D(-4400.f, -6400.f), FVector2D(-1300.f, -3000.f)));
	Reserved.Add(FBox2D(FVector2D(1900.f, -5000.f), FVector2D(4200.f, -2600.f)));
	Reserved.Add(FBox2D(FVector2D(-4600.f, 3000.f), FVector2D(-1500.f, 5600.f)));
	int32 Houses = 0;
	for (float GX = -9750.f; GX <= 9750.f; GX += 1500.f)
	{
		for (float GY = -9750.f; GY <= 9750.f; GY += 1500.f)
		{
			const FVector2D C(GX + R.FRandRange(-180.f, 180.f), GY + R.FRandRange(-180.f, 180.f));
			if (C.Size() > WR - 1500.f || C.Size() < 4400.f) continue;
			if (FMath::Abs(C.Y) < 1500.f || (FMath::Abs(C.X) < 1500.f)) continue;
			bool bBlocked = false;
			for (const FBox2D& B : Reserved)
			{
				if (B.ExpandBy(700.f).IsInside(C)) { bBlocked = true; break; }
			}
			if (bBlocked) continue;

			const float W = R.FRandRange(750.f, 1150.f), D = R.FRandRange(620.f, 900.f), H = R.FRandRange(520.f, 760.f);
			const float Yaw = (FMath::Abs(C.X) < FMath::Abs(C.Y) ? 0.f : 90.f) + R.FRandRange(-5.f, 5.f);
			const FTransform T(FRotator(0, Yaw, 0), FVector(C.X, C.Y, Z));
			const int32 WI = R.RandRange(0, 3), RI = R.RandRange(0, 3);
			AddBox(HouseWalls[WI], T, FVector(0, 0, H * 0.5f), FVector(W, D, H));
			float Top = H;
			const bool bTwoFloors = R.FRand() < 0.45f;
			if (bTwoFloors)
			{
				const float H2 = H * 0.8f;
				AddBox(HouseWalls[(WI + 1) % 4 == 2 ? 0 : (WI + 1) % 4], T, FVector(0, 0, H + H2 * 0.5f), FVector(W + 80.f, D + 80.f, H2));
				AddBox(Beam, T, FVector(0, 0, H), FVector(W + 110.f, D + 110.f, 32.f));
				for (int32 Corner = 0; Corner < 4; ++Corner)
				{
					const float SX = (Corner & 1) ? 1.f : -1.f, SY = (Corner & 2) ? 1.f : -1.f;
					AddBox(Beam, T, FVector(SX * (W * 0.5f + 42.f), SY * (D * 0.5f + 42.f), H + H2 * 0.5f), FVector(26.f, 26.f, H2));
				}
				for (int32 Wn = 0; Wn < 2; ++Wn)
				{
					AddBox(Window, T, FVector((Wn ? 0.25f : -0.25f) * W, -(D * 0.5f + 46.f), H + H2 * 0.5f), FVector(120.f, 12.f, 140.f));
					AddBox(Window, T, FVector((Wn ? 0.25f : -0.25f) * W, (D * 0.5f + 46.f), H + H2 * 0.5f), FVector(120.f, 12.f, 140.f));
				}
				Top += H2;
			}
			Gable(Roofs[RI], T, Top, W, D + (bTwoFloors ? 80.f : 0.f));
			AddBox(Door, T, FVector(W * 0.18f, -(D * 0.5f + 6.f), 130.f), FVector(150.f, 14.f, 260.f));
			AddBox(Window, T, FVector(-W * 0.22f, -(D * 0.5f + 6.f), H * 0.55f), FVector(110.f, 12.f, 120.f));
			AddBox(Window, T, FVector(W * 0.25f, (D * 0.5f + 6.f), H * 0.55f), FVector(110.f, 12.f, 120.f));
			AddBox(Window, T, FVector(-(W * 0.5f + 6.f), 0, H * 0.55f), FVector(12.f, 110.f, 120.f));
			if (R.FRand() < 0.55f)
			{
				AddBox(StoneDark, T, FVector(W * 0.3f, D * 0.12f, Top + D * 0.3f), FVector(90.f, 90.f, D * 0.55f + 120.f));
			}
			if (R.FRand() < 0.35f)
			{
				AddBox(Wood, T, FVector(-W * 0.3f, -(D * 0.5f + 90.f), 45.f), FVector(70.f, 70.f, 90.f));
				AddBox(Wood, T, FVector(-W * 0.3f + 85.f, -(D * 0.5f + 90.f), 45.f), FVector(70.f, 70.f, 90.f));
			}
			++Houses;
		}
	}

	// ---- Street lamps ----
	int32 LampIdx = 0;
	for (float Dist = 2000.f; Dist < WR - 900.f; Dist += 1600.f)
	{
		for (int32 Arm = 0; Arm < 4; ++Arm)
		{
			if (Arm == 0 && Dist > 5000.f) continue;
			const FVector Dir = FRotator(0, Arm * 90.f, 0).Vector();
			const FVector Side(-Dir.Y, Dir.X, 0.f);
			for (int32 S = -1; S <= 1; S += 2)
			{
				const FVector P = Dir * Dist + Side * (S * 1000.f);
				AddLamp(FVector(P.X, P.Y, Z), (LampIdx++ % 2) == 0);
			}
		}
	}

	UE_LOG(LogSlime, Log, TEXT("Altheria: %d houses, %d night lights"), Houses, NightLights.Num());
}

// ============================================================================
// Landmarks in the wilds
// ============================================================================

void ASRWorld::BuildLandmarks()
{
	using HISM = UHierarchicalInstancedStaticMeshComponent;
	FRandomStream R(777);
	HISM* Tent = MakeHISM(TEXT("Cone"), SR::Hex(0x6b5236), true);
	HISM* Logs = MakeHISM(TEXT("Cylinder"), SR::Hex(0x5b4330), true);
	HISM* Pillar = MakeHISM(TEXT("Cylinder"), SR::Hex(0xa39e92), true);
	HISM* Block = MakeHISM(TEXT("Cube"), SR::Hex(0x8e897f), true);
	HISM* Web = MakeHISM(TEXT("Sphere"), SR::Hex(0xe6e4dc), false);
	HISM* Bone = MakeHISM(TEXT("Cylinder"), SR::Hex(0xd8d2c0), false);
	HISM* Shroom = MakeHISM(TEXT("Sphere"), SR::Hex(0x7a4bd6), false, 0.f, ESRMat::Fx, 3.f);

	auto Light = [this](const FVector& P, const FLinearColor& C, float I, float Rad)
	{
		UPointLightComponent* L = NewObject<UPointLightComponent>(this);
		L->SetMobility(EComponentMobility::Movable);
		L->SetRelativeLocation(P);
		L->SetIntensity(I);
		L->SetAttenuationRadius(Rad);
		L->SetLightColor(C);
		L->SetCastShadows(false);
		L->SetupAttachment(Root);
		L->RegisterComponent();
	};
	const TArray<FSRZone>& Z = SR::Zones();

	// Goblin camps: tents, palisade and a bonfire
	for (int32 Zi : { 0, 7 })
	{
		const FVector C = SR::Ground(Z[Zi].Center.X, Z[Zi].Center.Y);
		for (int32 t = 0; t < 7; ++t)
		{
			const FVector P = SR::Ground(C.X + FMath::Cos(t * 0.9f) * 1500.f, C.Y + FMath::Sin(t * 0.9f) * 1500.f);
			Tent->AddInstance(FTransform(FRotator(0, t * 40.f, 0), P + FVector(0, 0, 180.f), FVector(5.f, 5.f, 4.f)));
		}
		for (int32 l = 0; l < 48; ++l)
		{
			const float A = l / 48.f * 2.f * PI;
			if (FMath::Abs(FMath::Sin(A)) < 0.08f && FMath::Cos(A) > 0.f) continue;
			const FVector P = SR::Ground(C.X + FMath::Cos(A) * 2900.f, C.Y + FMath::Sin(A) * 2900.f);
			Logs->AddInstance(FTransform(FRotator(R.FRandRange(-6.f, 6.f), 0, R.FRandRange(-6.f, 6.f)), P + FVector(0, 0, 160.f), FVector(0.55f, 0.55f, 3.6f)));
		}
		SR::AddPart(this, Root, TEXT("Sphere"), C + FVector(0, 0, 60.f), FVector(1.6f, 1.6f, 1.2f), FLinearColor(1.f, 0.4f, 0.05f), FRotator::ZeroRotator, ESRMat::Fx, 10.f);
		Light(C + FVector(0, 0, 200.f), FLinearColor(1.f, 0.45f, 0.15f), 12000.f, 2600.f);
	}

	// Northern ruins: broken colonnades and walls
	{
		const FVector C = SR::Ground(Z[5].Center.X, Z[5].Center.Y);
		for (int32 p = 0; p < 40; ++p)
		{
			const float X = C.X + R.FRandRange(-9000.f, 9000.f), Y = C.Y + R.FRandRange(-9000.f, 9000.f);
			const FVector P = SR::Ground(X, Y);
			const float H = R.FRandRange(300.f, 1400.f);
			Pillar->AddInstance(FTransform(FRotator(R.FRandRange(-5.f, 5.f), 0, R.FRandRange(-5.f, 5.f)), P + FVector(0, 0, H * 0.5f - 40.f), FVector(1.6f, 1.6f, H / 100.f)));
			if (R.FRand() < 0.4f)
			{
				Block->AddInstance(FTransform(FRotator(R.FRandRange(-10.f, 10.f), R.FRandRange(0.f, 360.f), 0), P + FVector(R.FRandRange(200.f, 600.f), 0, 60.f), FVector(R.FRandRange(4.f, 12.f), 1.6f, R.FRandRange(1.f, 4.f))));
			}
		}
		for (int32 a = 0; a < 3; ++a)
		{
			const FVector P = SR::Ground(C.X + a * 1200.f - 1200.f, C.Y + 2000.f);
			Pillar->AddInstance(FTransform(FRotator::ZeroRotator, P + FVector(0, -400.f, 700.f), FVector(1.8f, 1.8f, 14.f)));
			Pillar->AddInstance(FTransform(FRotator::ZeroRotator, P + FVector(0, 400.f, 700.f), FVector(1.8f, 1.8f, 14.f)));
			Block->AddInstance(FTransform(FRotator::ZeroRotator, P + FVector(0, 0, 1450.f), FVector(2.2f, 10.5f, 1.6f)));
		}
	}

	// Throne of the Orc King: stone dais, pillars and braziers
	{
		const FVector C = SR::Ground(Z[6].Center.X, Z[6].Center.Y);
		Pillar->AddInstance(FTransform(FRotator::ZeroRotator, C + FVector(0, 0, 20.f), FVector(40.f, 40.f, 1.f)));
		Block->AddInstance(FTransform(FRotator::ZeroRotator, C + FVector(1600.f, 0, 400.f), FVector(6.f, 8.f, 8.f)));
		Block->AddInstance(FTransform(FRotator::ZeroRotator, C + FVector(1900.f, 0, 900.f), FVector(2.f, 8.f, 12.f)));
		for (int32 p = 0; p < 10; ++p)
		{
			const float A = p / 10.f * 2.f * PI;
			const FVector P = C + FVector(FMath::Cos(A) * 2300.f, FMath::Sin(A) * 2300.f, 0.f);
			Pillar->AddInstance(FTransform(FRotator::ZeroRotator, P + FVector(0, 0, 900.f), FVector(2.4f, 2.4f, 18.f)));
			if (p % 2 == 0)
			{
				SR::AddPart(this, Root, TEXT("Sphere"), P + FVector(0, 0, 1900.f), FVector(1.4f), FLinearColor(1.f, 0.3f, 0.05f), FRotator::ZeroRotator, ESRMat::Fx, 12.f);
				Light(P + FVector(0, 0, 1950.f), FLinearColor(1.f, 0.35f, 0.1f), 15000.f, 3000.f);
			}
		}
		for (int32 b = 0; b < 30; ++b)
		{
			Bone->AddInstance(FTransform(FRotator(90.f, R.FRandRange(0.f, 360.f), 0), C + FVector(R.FRandRange(-2000.f, 2000.f), R.FRandRange(-2000.f, 2000.f), 40.f), FVector(0.25f, 0.25f, R.FRandRange(0.8f, 2.f))));
		}
	}

	// Spider nest: webs and cocoons
	{
		const FVector C = SR::Ground(Z[2].Center.X, Z[2].Center.Y);
		for (int32 w = 0; w < 70; ++w)
		{
			const FVector P = SR::Ground(C.X + R.FRandRange(-6000.f, 6000.f), C.Y + R.FRandRange(-6000.f, 6000.f));
			const float S = R.FRandRange(1.f, 5.f);
			Web->AddInstance(FTransform(FRotator(R.FRandRange(0.f, 90.f), R.FRandRange(0.f, 360.f), 0), P + FVector(0, 0, S * 30.f), FVector(S, S * 0.4f, S * 1.2f)));
		}
	}

	// Swamp: glowing mushrooms
	{
		const FVector C = SR::Ground(Z[4].Center.X, Z[4].Center.Y);
		for (int32 m = 0; m < 60; ++m)
		{
			const FVector P = SR::Ground(C.X + R.FRandRange(-10000.f, 10000.f), C.Y + R.FRandRange(-10000.f, 10000.f));
			if (P.Z < 20.f) continue;
			const float S = R.FRandRange(0.4f, 1.6f);
			Logs->AddInstance(FTransform(FRotator::ZeroRotator, P + FVector(0, 0, S * 50.f), FVector(S * 0.25f, S * 0.25f, S)));
			Shroom->AddInstance(FTransform(FRotator::ZeroRotator, P + FVector(0, 0, S * 100.f), FVector(S * 1.1f, S * 1.1f, S * 0.45f)));
			if (m % 10 == 0) Light(P + FVector(0, 0, 200.f), FLinearColor(0.5f, 0.3f, 1.f), 5000.f, 1600.f);
		}
	}
}

// ============================================================================
// Sites of Grace
// ============================================================================

void ASRWorld::BuildGraces()
{
	for (const FSRGrace& G : SR::Graces())
	{
		SR::AddPart(this, Root, TEXT("Cylinder"), G.Location + FVector(0, 0, 4.f), FVector(2.4f, 2.4f, 0.06f), FLinearColor(1.f, 0.78f, 0.3f), FRotator::ZeroRotator, ESRMat::Fx, 5.f);
		SR::AddPart(this, Root, TEXT("Sphere"), G.Location + FVector(0, 0, 150.f), FVector(0.35f), FLinearColor(1.f, 0.85f, 0.45f), FRotator::ZeroRotator, ESRMat::Fx, 20.f);
		SR::AddPart(this, Root, TEXT("Cone"), G.Location + FVector(0, 0, 110.f), FVector(0.25f, 0.25f, 1.4f), FLinearColor(1.f, 0.8f, 0.35f), FRotator::ZeroRotator, ESRMat::Fx, 10.f);
		for (int32 p = 0; p < 3; ++p)
		{
			const FVector P = G.Location + FRotator(0, p * 120.f + 20.f, 0).Vector() * 420.f;
			SR::AddPart(this, Root, TEXT("Cylinder"), FVector(P.X, P.Y, SR::HeightAt(P.X, P.Y) + 120.f), FVector(0.5f, 0.5f, 2.6f), SR::Hex(0xa39e92));
		}
		UPointLightComponent* L = NewObject<UPointLightComponent>(this);
		L->SetMobility(EComponentMobility::Movable);
		L->SetRelativeLocation(G.Location + FVector(0, 0, 180.f));
		L->SetIntensity(5000.f);
		L->SetAttenuationRadius(1100.f);
		L->SetLightColor(FLinearColor(1.f, 0.78f, 0.4f));
		L->SetCastShadows(false);
		L->SetupAttachment(Root);
		L->RegisterComponent();
	}
}

// ============================================================================
// Citizens of Altheria
// ============================================================================

void ASRWorld::SpawnCitizens()
{
	UWorld* World = GetWorld();
	if (!World) return;
	const float Z = SR::CityZ + 110.f;

	auto Spawn = [World, Z](const FString& Name, ESRNPCRole Role, float X, float Y, float Wander, int32 Seed, float Yaw)
	{
		const FTransform T(FRotator(0, Yaw, 0), FVector(X, Y, Z));
		ASRNPC* N = World->SpawnActorDeferred<ASRNPC>(ASRNPC::StaticClass(), T, nullptr, nullptr, ESpawnActorCollisionHandlingMethod::AlwaysSpawn);
		if (N)
		{
			N->Setup(Name, Role, Seed, Wander);
			N->FinishSpawning(T);
		}
		return N;
	};

	Spawn(TEXT("Brann, Gildamastro"), ESRNPCRole::GuildMaster, -1700.f, -3350.f, 0.f, 11, 0.f);
	Spawn(TEXT("Elia la Mercante"), ESRNPCRole::Merchant, 2050.f, 1750.f, 0.f, 22, 220.f);
	Spawn(TEXT("Torvin il Fabbro"), ESRNPCRole::Blacksmith, 2000.f, -2700.f, 0.f, 33, 180.f);
	Spawn(TEXT("Sacerdotessa Lyra"), ESRNPCRole::Priestess, 2200.f, 5200.f, 0.f, 44, 180.f);
	Spawn(TEXT("Capitano Ardan"), ESRNPCRole::Guard, -9000.f, 600.f, 0.f, 55, 0.f);
	Spawn(TEXT("Bardo Fiorenzo"), ESRNPCRole::Bard, -2000.f, 2600.f, 300.f, 66, 300.f);

	for (int32 g = 0; g < 3; ++g)
	{
		const float A = g == 0 ? 180.f : (g == 1 ? 90.f : 270.f);
		const FVector Dir = FRotator(0, A, 0).Vector();
		const FVector Side(-Dir.Y, Dir.X, 0.f);
		for (int32 S = -1; S <= 1; S += 2)
		{
			const FVector P = Dir * (SR::CityR - 1100.f) + Side * (S * 750.f);
			Spawn(TEXT("Guardia Reale"), ESRNPCRole::Guard, P.X, P.Y, 0.f, 100 + g * 2 + (S > 0 ? 1 : 0), A + 180.f);
		}
	}
	Spawn(TEXT("Guardia del Castello"), ESRNPCRole::Guard, 6300.f, -700.f, 0.f, 120, 180.f);
	Spawn(TEXT("Guardia del Castello"), ESRNPCRole::Guard, 6300.f, 700.f, 0.f, 121, 180.f);

	FRandomStream R(9090);
	static const TCHAR* First[] = { TEXT("Marta"), TEXT("Giulio"), TEXT("Elena"), TEXT("Tomas"), TEXT("Irene"), TEXT("Bruno"),
		TEXT("Sofia"), TEXT("Aldo"), TEXT("Nadia"), TEXT("Pietro"), TEXT("Lucia"), TEXT("Ivo"), TEXT("Greta"), TEXT("Ottavio"),
		TEXT("Selene"), TEXT("Ugo"), TEXT("Viola"), TEXT("Rinaldo"), TEXT("Agata"), TEXT("Dario"), TEXT("Mira"), TEXT("Corrado") };
	static const TCHAR* Jobs[] = { TEXT("cittadina"), TEXT("cittadino"), TEXT("mercante"), TEXT("contadino"), TEXT("artigiana"),
		TEXT("avventuriero"), TEXT("avventuriera"), TEXT("pescatore"), TEXT("sarta"), TEXT("studioso") };
	for (int32 c = 0; c < 56; ++c)
	{
		FVector2D P;
		const int32 Where = R.RandRange(0, 2);
		if (Where == 0)
		{
			const float A = R.FRandRange(0.f, 2.f * PI);
			P = FVector2D(FMath::Cos(A), FMath::Sin(A)) * R.FRandRange(1400.f, 3600.f);
		}
		else
		{
			const float Along = R.FRandRange(4000.f, SR::CityR - 1800.f) * (R.FRand() < 0.5f ? -1.f : 1.f);
			const float Across = R.FRandRange(-650.f, 650.f);
			P = Where == 1 ? FVector2D(FMath::Min(Along, 5200.f), Across) : FVector2D(Across, Along);
		}
		const FString Name = FString::Printf(TEXT("%s, %s"), First[R.RandRange(0, static_cast<int32>(UE_ARRAY_COUNT(First)) - 1)], Jobs[R.RandRange(0, static_cast<int32>(UE_ARRAY_COUNT(Jobs)) - 1)]);
		Spawn(Name, c < 6 ? ESRNPCRole::Child : ESRNPCRole::Citizen, P.X, P.Y, 1400.f, 1000 + c, R.FRandRange(0.f, 360.f));
	}
}
