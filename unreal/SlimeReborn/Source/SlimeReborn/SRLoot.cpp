#include "SRLoot.h"
#include "SlimeCharacter.h"
#include "Components/StaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"

ASRLoot::ASRLoot()
{
	PrimaryActorTick.bCanEverTick = true;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;
	Orb = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Orb"));
	Orb->SetupAttachment(Root);
	Orb->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Orb->SetCastShadow(false);
	Beam = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Beam"));
	Beam->SetupAttachment(Root);
	Beam->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Beam->SetCastShadow(false);
	Light = CreateDefaultSubobject<UPointLightComponent>(TEXT("Light"));
	Light->SetupAttachment(Root);
	Light->SetCastShadows(false);
	InitialLifeSpan = 240.f;
}

ASRLoot* ASRLoot::Drop(UWorld* World, const FVector& At, const FSRItem& InItem)
{
	if (!World || !InItem.IsValid()) return nullptr;
	FActorSpawnParameters P;
	P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	ASRLoot* L = World->SpawnActor<ASRLoot>(ASRLoot::StaticClass(), At, FRotator::ZeroRotator, P);
	if (L) L->Init(InItem);
	return L;
}

void ASRLoot::Init(const FSRItem& InItem)
{
	Item = InItem;
	Base = GetActorLocation();
	const FLinearColor C = SR::RarityColor(Item.Rarity);
	Orb->SetStaticMesh(SR::Mesh(Item.Slot == ESRItemSlot::Ring ? TEXT("Sphere") : TEXT("Cube")));
	Orb->SetRelativeScale3D(FVector(Item.Slot == ESRItemSlot::Weapon ? 0.12f : 0.22f, 0.22f, Item.Slot == ESRItemSlot::Weapon ? 0.55f : 0.22f));
	Orb->SetMaterial(0, SR::MakeMID(this, C, ESRMat::Fx, 6.f + Item.Rarity * 3.f));
	Beam->SetStaticMesh(SR::Mesh(TEXT("Cylinder")));
	Beam->SetRelativeScale3D(FVector(0.06f + Item.Rarity * 0.02f, 0.06f + Item.Rarity * 0.02f, 3.f + Item.Rarity * 2.f));
	Beam->SetRelativeLocation(FVector(0, 0, (3.f + Item.Rarity * 2.f) * 50.f));
	Beam->SetMaterial(0, SR::MakeMID(this, C, ESRMat::Fx, 2.f + Item.Rarity * 2.f));
	Light->SetLightColor(C);
	Light->SetIntensity(2500.f + Item.Rarity * 2500.f);
	Light->SetAttenuationRadius(500.f + Item.Rarity * 150.f);
	Light->SetRelativeLocation(FVector(0, 0, 60.f));
}

void ASRLoot::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Clock += DeltaSeconds;
	Orb->SetRelativeLocation(FVector(0, 0, 45.f + FMath::Sin(Clock * 2.5f) * 10.f));
	Orb->SetRelativeRotation(FRotator(0, Clock * 90.f, 25.f));

	ASlimeCharacter* P = Cast<ASlimeCharacter>(UGameplayStatics::GetPlayerPawn(this, 0));
	if (!P || P->bDead || Clock < 0.6f) return;
	const FVector D = P->GetActorLocation() - GetActorLocation();
	if (FVector2D(D.X, D.Y).Size() < 170.f && FMath::Abs(D.Z) < 260.f)
	{
		if (P->PickUp(Item)) Destroy();
	}
}
