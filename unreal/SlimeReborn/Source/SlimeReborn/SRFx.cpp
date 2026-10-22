#include "SRFx.h"
#include "SRTypes.h"
#include "Components/StaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Engine/World.h"

ASRFx::ASRFx()
{
	PrimaryActorTick.bCanEverTick = true;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;
	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	Mesh->SetupAttachment(Root);
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Mesh->SetCastShadow(false);
	Mesh2 = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh2"));
	Mesh2->SetupAttachment(Root);
	Mesh2->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Mesh2->SetCastShadow(false);
	Light = CreateDefaultSubobject<UPointLightComponent>(TEXT("Light"));
	Light->SetupAttachment(Root);
	Light->SetCastShadows(false);
	InitialLifeSpan = 3.f;
}

ASRFx* ASRFx::Spawn(UWorld* World, ESRFxKind Kind, const FVector& At, const FLinearColor& Color, float Size, float Duration, const FRotator& Rot)
{
	if (!World) return nullptr;
	FActorSpawnParameters P;
	P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	ASRFx* Fx = World->SpawnActor<ASRFx>(ASRFx::StaticClass(), At, Rot, P);
	if (Fx) Fx->Init(Kind, Color, Size, Duration);
	return Fx;
}

void ASRFx::Init(ESRFxKind InKind, const FLinearColor& InColor, float InSize, float InDuration)
{
	Kind = InKind;
	Color = InColor;
	Size = InSize;
	Duration = FMath::Max(0.05f, InDuration);
	SetLifeSpan(Duration + 0.1f);

	const TCHAR* Shape = TEXT("Sphere");
	const TCHAR* Shape2 = nullptr;
	switch (Kind)
	{
	case ESRFxKind::Ring: Shape = TEXT("Cylinder"); break;
	case ESRFxKind::Pillar: Shape = TEXT("Cylinder"); Shape2 = TEXT("Sphere"); break;
	case ESRFxKind::Slash: Shape = TEXT("Cylinder"); break;
	case ESRFxKind::Vortex: Shape = TEXT("Sphere"); Shape2 = TEXT("Cylinder"); break;
	default: break;
	}
	Mesh->SetStaticMesh(SR::Mesh(Shape));
	Mid = SR::MakeMID(this, Color, ESRMat::Fx, 10.f);
	Mesh->SetMaterial(0, Mid);
	if (Shape2)
	{
		Mesh2->SetStaticMesh(SR::Mesh(Shape2));
		Mid2 = SR::MakeMID(this, Color, ESRMat::Fx, 14.f);
		Mesh2->SetMaterial(0, Mid2);
	}
	Light->SetLightColor(Color);
	Light->SetAttenuationRadius(FMath::Max(400.f, Size * 3.f));
	Light->SetIntensity(Kind == ESRFxKind::Spark ? 4000.f : 20000.f);
	Tick(0.f);
}

void ASRFx::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Age += DeltaSeconds;
	const float T = FMath::Clamp(Age / Duration, 0.f, 1.f);
	const float Fade = 1.f - T;
	const float S = Size / 100.f;

	switch (Kind)
	{
	case ESRFxKind::Burst:
		Mesh->SetRelativeScale3D(FVector(S * (0.3f + 0.9f * FMath::Sqrt(T))));
		break;
	case ESRFxKind::Spark:
		Mesh->SetRelativeScale3D(FVector(S * (0.5f + T) * Fade));
		break;
	case ESRFxKind::Ring:
		Mesh->SetRelativeScale3D(FVector(S * 2.f * (0.15f + 0.85f * T), S * 2.f * (0.15f + 0.85f * T), 0.06f + 0.25f * Fade));
		Mesh->SetRelativeLocation(FVector(0, 0, 10.f));
		break;
	case ESRFxKind::Pillar:
		Mesh->SetRelativeScale3D(FVector(S * Fade + 0.05f, S * Fade + 0.05f, 40.f));
		Mesh->SetRelativeLocation(FVector(0, 0, 2000.f));
		Mesh2->SetRelativeScale3D(FVector(S * 2.5f * (0.3f + T)));
		break;
	case ESRFxKind::Slash:
		Mesh->SetRelativeScale3D(FVector(S * 2.f, S * 2.f, 0.04f) * (0.6f + 0.4f * T));
		Mesh->SetRelativeRotation(FRotator(0, T * 300.f, 0));
		break;
	case ESRFxKind::Vortex:
		Mesh->SetRelativeScale3D(FVector(S * (1.2f - T)));
		Mesh2->SetRelativeScale3D(FVector(S * 3.f * (1.f - T * 0.8f), S * 3.f * (1.f - T * 0.8f), 0.05f));
		Mesh2->SetRelativeRotation(FRotator(0, Age * 720.f, 0));
		break;
	}
	if (Mid) Mid->SetScalarParameterValue(TEXT("Glow"), 10.f * Fade);
	if (Mid) Mid->SetScalarParameterValue(TEXT("Opacity"), Fade);
	if (Mid2) Mid2->SetScalarParameterValue(TEXT("Glow"), 14.f * Fade);
	if (Mid2) Mid2->SetScalarParameterValue(TEXT("Opacity"), Fade);
	Light->SetIntensity((Kind == ESRFxKind::Spark ? 4000.f : 20000.f) * Fade * Fade);
}
