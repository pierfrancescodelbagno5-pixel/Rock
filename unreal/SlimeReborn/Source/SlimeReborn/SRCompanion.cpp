#include "SRCompanion.h"
#include "SlimeCharacter.h"
#include "SREnemy.h"
#include "SRProjectile.h"
#include "SRFx.h"
#include "Components/CapsuleComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"
#include "EngineUtils.h"

namespace
{
	struct FCompanionTextDef
	{
		const TCHAR* Name;
		const TCHAR* Title;
		const TCHAR* Stranger[2];
		const TCHAR* Join;
		const TCHAR* Friend[2];
		const TCHAR* Close[2];
		const TCHAR* Love;
		const TCHAR* Yes;
		const TCHAR* Married[2];
	};

	const FCompanionTextDef CompanionTexts[ASRCompanion::Num] = {
		{ TEXT("Kaede"), TEXT("Spadaccina Oni"),
			{ TEXT("Hm. Un altro avventuriero. Dimostrami che sai combattere e forse ti seguiro'."), TEXT("Le corna? Sono un'oni. Non fissarle troppo.") },
			TEXT("Va bene. La mia lama e' tua. Non deludermi."),
			{ TEXT("Combattere al tuo fianco... non e' male."), TEXT("Mangi abbastanza? Non mi serve un compagno che salta i pasti.") },
			{ TEXT("Quando sei vicino il cuore mi batte come prima di un duello. Strano, vero?"), TEXT("Ti ho preparato degli onigiri. Non dire niente.") },
			TEXT("Se mi chiedessi di restare con te per sempre... risponderei di si'."),
			TEXT("Si'. Mille volte si'. Da oggi la mia spada e il mio cuore sono tuoi."),
			{ TEXT("Bentornato, amore mio. Pronto a tagliare qualche orco insieme?"), TEXT("Ho affilato la tua arma mentre dormivi. Prego.") } },
		{ TEXT("Liora"), TEXT("Maga Elfica"),
			{ TEXT("Un essere che divora la magia? Affascinante... posso studiarti?"), TEXT("Gli elfi vivono a lungo. Ho tutto il tempo per conoscerti.") },
			TEXT("Verro' con te. Per la scienza! ...e forse non solo."),
			{ TEXT("Il tuo flusso di mana e' bellissimo, lo sapevi?"), TEXT("Ho scritto tre volumi su di te. Sei un argomento inesauribile.") },
			{ TEXT("Trecento anni di studi, e nessun libro mi ha mai fatta sentire cosi'."), TEXT("Stanotte guardiamo le stelle insieme? Ti insegno i loro nomi.") },
			TEXT("Ho deciso: voglio passare la mia lunghissima vita con te."),
			TEXT("Lo voglio. Scrivero' questo giorno nel primo capitolo di ogni mio libro."),
			{ TEXT("Mio caro, ho inventato un nuovo incantesimo. Lo proviamo sugli orchi?"), TEXT("Ho messo dei fiori di luna sul tuo zaino. Portano fortuna.") } },
		{ TEXT("Rhea"), TEXT("Cacciatrice Kemonomimi"),
			{ TEXT("*annusa* Odori di slime e di avventura! Mi piaci!"), TEXT("Le orecchie si muovono da sole quando sono felice. Non ridere!") },
			TEXT("Una caccia insieme? Evviva! Ti copro le spalle con l'arco!"),
			{ TEXT("Hai visto quel colpo? Dritto in mezzo agli occhi del goblin!"), TEXT("Mi gratti dietro le orecchie? ...Solo un pochino.") },
			{ TEXT("La coda non smette di scodinzolare quando ci sei tu..."), TEXT("Ti ho portato il cinghiale piu' grosso della foresta. Tutto per te!") },
			TEXT("Il mio branco... voglio che sia tu. Per sempre."),
			TEXT("*scodinzola fortissimo* Si'! Si'! Il mio branco per sempre!"),
			{ TEXT("Sei tornato! *scodinzola* Andiamo a caccia, tesoro?"), TEXT("Ho segnato la strada con le mie frecce, cosi' non ti perdi.") } },
	};

	constexpr int32 WeddingCost = 300;
}

ASRCompanion::ASRCompanion()
{
	PrimaryActorTick.bCanEverTick = true;
	AutoPossessAI = EAutoPossessAI::PlacedInWorldOrSpawned;
	GetCapsuleComponent()->InitCapsuleSize(34.f, 92.f);
	GetCapsuleComponent()->SetCollisionResponseToChannel(ECC_Camera, ECR_Ignore);
	GetCapsuleComponent()->SetCollisionResponseToChannel(ECC_Pawn, ECR_Ignore);
	UCharacterMovementComponent* Move = GetCharacterMovement();
	Move->MaxWalkSpeed = 160.f;
	Move->bOrientRotationToMovement = true;
	Move->RotationRate = FRotator(0, 540.f, 0);
	Move->bRunPhysicsWithNoController = true;
	Move->MaxAcceleration = 3000.f;
	bUseControllerRotationYaw = false;
}

FVector2D ASRCompanion::HomeOf(int32 InIndex)
{
	static const FVector2D Homes[Num] = { FVector2D(-2200.f, -2900.f), FVector2D(2500.f, 4500.f), FVector2D(-2400.f, 3300.f) };
	return Homes[FMath::Clamp(InIndex, 0, Num - 1)];
}

void ASRCompanion::Setup(int32 InIndex)
{
	Index = FMath::Clamp(InIndex, 0, Num - 1);
}

void ASRCompanion::BeginPlay()
{
	Super::BeginPlay();
	Home = GetActorLocation();
	BuildBody();
}

FString ASRCompanion::DisplayName() const
{
	return FString::Printf(TEXT("%s, %s"), CompanionTexts[Index].Name, CompanionTexts[Index].Title);
}

void ASRCompanion::BuildBody()
{
	FSRHumanStyle S;
	S.bLongHair = true;
	S.bSkirt = true;
	S.bCape = true;
	switch (Index)
	{
	case 0: // Kaede: crimson oni swordswoman
		S.Hair = SR::Hex(0xb02a2a); S.Skin = SR::Hex(0xf4dccb); S.Shirt = SR::Hex(0x2a2a34); S.Pants = SR::Hex(0x1a1a22);
		S.Cape = SR::Hex(0x8c1c2a); S.Accent = SR::Hex(0xd8b04a); S.Eyes = FLinearColor(1.f, 0.3f, 0.2f); S.bGlowEyes = true; S.Weapon = 1;
		S.Height = 1.02f;
		break;
	case 1: // Liora: silver-haired elven mage
		S.Hair = SR::Hex(0xe8ecf4); S.Skin = SR::Hex(0xf6e6da); S.Shirt = SR::Hex(0x2e5a4a); S.Pants = SR::Hex(0x1e3a30);
		S.Cape = SR::Hex(0xe0d8b0); S.Accent = FLinearColor(0.4f, 1.f, 0.7f); S.bPointyEars = true; S.Eyes = SR::Hex(0x3a8a6a); S.Weapon = 3;
		break;
	default: // Rhea: beastkin huntress
		S.Hair = SR::Hex(0xc87a3a); S.Skin = SR::Hex(0xe8c4a0); S.Shirt = SR::Hex(0x5a4a2a); S.Pants = SR::Hex(0x3a3020);
		S.Cape = SR::Hex(0x3a5a2a); S.Accent = SR::Hex(0x8a6a3a); S.bSkirt = false; S.Eyes = SR::Hex(0xe0a020); S.Weapon = 7;
		S.Height = 0.94f;
		break;
	}
	USceneComponent* Base = SR::AddPivot(this, GetCapsuleComponent(), FVector(0, 0, -92.f));
	Rig = SR::BuildHumanoid(this, Base, S);
	if (!Rig.Head) return;
	if (Index == 0)
	{
		SR::AddPart(this, Rig.Head, TEXT("Cone"), FVector(4.f, -8.f, 40.f), FVector(0.05f, 0.05f, 0.18f), SR::Hex(0xf0e8d8), FRotator(0, 0, -15.f));
		SR::AddPart(this, Rig.Head, TEXT("Cone"), FVector(4.f, 8.f, 40.f), FVector(0.05f, 0.05f, 0.18f), SR::Hex(0xf0e8d8), FRotator(0, 0, 15.f));
	}
	else if (Index == 2)
	{
		SR::AddPart(this, Rig.Head, TEXT("Cone"), FVector(-2.f, -10.f, 40.f), FVector(0.09f, 0.05f, 0.16f), S.Hair, FRotator(0, 0, -20.f));
		SR::AddPart(this, Rig.Head, TEXT("Cone"), FVector(-2.f, 10.f, 40.f), FVector(0.09f, 0.05f, 0.16f), S.Hair, FRotator(0, 0, 20.f));
		Rig.Tail = SR::AddPivot(this, Rig.Torso, FVector(-14.f, 0, 92.f));
		SR::AddPart(this, Rig.Tail, TEXT("Sphere"), FVector(-30.f, 0, -10.f), FVector(0.16f, 0.16f, 0.5f), S.Hair, FRotator(-120.f, 0, 0));
	}
}

void ASRCompanion::AddAffection(float Amount)
{
	Affection = FMath::Clamp(Affection + Amount, 0.f, 100.f);
}

void ASRCompanion::ApplyState(float InAffection, bool bInRecruited, bool bInMarried)
{
	Affection = FMath::Clamp(InAffection, 0.f, 100.f);
	bRecruited = bInRecruited;
	bMarried = bInMarried;
}

void ASRCompanion::ReturnHome()
{
	const FVector2D H = HomeOf(Index);
	SetActorLocation(FVector(H.X, H.Y, SR::CityZ + 110.f), false, nullptr, ETeleportType::TeleportPhysics);
	Home = GetActorLocation();
	GetCharacterMovement()->StopMovementImmediately();
}

FString ASRCompanion::Interact(ASlimeCharacter* Player)
{
	if (!Player) return FString();
	const FCompanionTextDef& T = CompanionTexts[Index];
	const bool bGain = TalkCool <= 0.f;
	if (bGain)
	{
		TalkCool = 25.f;
		AddAffection(4.f);
	}
	const int32 Pick = (LineIdx++) % 2;

	if (bMarried) return T.Married[Pick];
	if (!bRecruited)
	{
		if (Affection >= 15.f)
		{
			bRecruited = true;
			Player->Toast(TEXT("NUOVA COMPAGNA"), FString::Printf(TEXT("%s si unisce al tuo gruppo"), T.Name));
			return T.Join;
		}
		if (!bGain) return T.Stranger[Pick];
		Player->Oracle(FString::Printf(TEXT("Affetto di %s: %d/15 per farla unire al gruppo."), T.Name, FMath::RoundToInt(Affection)));
		return T.Stranger[Pick];
	}
	if (Affection >= 90.f)
	{
		if (Player->Gold >= WeddingCost)
		{
			Player->Gold -= WeddingCost;
			bMarried = true;
			Player->Toast(TEXT("MATRIMONIO"), FString::Printf(TEXT("Tu e %s siete sposati!"), T.Name));
			Player->Oracle(FString::Printf(TEXT("Legame coniugale: +8%% vita e attacco. %s combatte con il 30%% di forza in piu'."), T.Name));
			ASRFx::Spawn(GetWorld(), ESRFxKind::Pillar, GetActorLocation(), FLinearColor(1.f, 0.6f, 0.8f), 120.f, 1.2f);
			Player->Recalc();
			return T.Yes;
		}
		Player->Oracle(FString::Printf(TEXT("Per chiedere la mano di %s serve un anello: %d oro."), T.Name, WeddingCost));
		return T.Love;
	}
	if (Affection >= 60.f) return T.Close[Pick];
	return T.Friend[Pick];
}

ASREnemy* ASRCompanion::PickTarget(ASlimeCharacter* Player) const
{
	ASREnemy* Best = nullptr;
	float BestD = 1800.f;
	for (TActorIterator<ASREnemy> It(GetWorld()); It; ++It)
	{
		ASREnemy* E = *It;
		if (E->IsDead()) continue;
		const float DP = FVector::Dist(E->GetActorLocation(), Player->GetActorLocation());
		if (!E->IsEngaged() && DP > 900.f) continue;
		const float D = FVector::Dist(E->GetActorLocation(), GetActorLocation());
		if (D < BestD) { BestD = D; Best = E; }
	}
	return Best;
}

void ASRCompanion::AttackTarget(ASREnemy* E, ASlimeCharacter* Player)
{
	const float Dmg = (6.f + Player->Level * 2.4f) * (bMarried ? 1.3f : 1.f);
	const FVector To = E->GetActorLocation() - GetActorLocation();
	SetActorRotation(FRotator(0, To.Rotation().Yaw, 0));
	AttackAnim = 0.35f;
	switch (Index)
	{
	case 0:
		E->TakeHit(Dmg * 1.25f, this, 300.f, false);
		ASRFx::Spawn(GetWorld(), ESRFxKind::Slash, GetActorLocation() + GetActorForwardVector() * 120.f, FLinearColor(1.f, 0.4f, 0.4f), 200.f, 0.2f, GetActorRotation());
		AttackCool = 0.9f;
		break;
	case 1:
		ASRProjectile::Fire(GetWorld(), this, GetActorLocation() + FVector(0, 0, 60.f), (E->GetActorLocation() - GetActorLocation() - FVector(0, 0, 60.f)).GetSafeNormal(), ESRSkill::Fireball, Dmg * 1.6f, false);
		AttackCool = 2.f;
		break;
	default:
		ASRProjectile::Fire(GetWorld(), this, GetActorLocation() + FVector(0, 0, 50.f), (E->GetActorLocation() - GetActorLocation() - FVector(0, 0, 50.f)).GetSafeNormal(), ESRSkill::PiercingArrow, Dmg, false);
		AttackCool = 1.2f;
		break;
	}
}

void ASRCompanion::Follow(ASlimeCharacter* Player, float Dt)
{
	const FVector P = Player->GetActorLocation();
	const FVector Behind = -Player->GetActorForwardVector();
	const FVector Side(-Behind.Y, Behind.X, 0.f);
	const FVector Want = P + Behind * 280.f + Side * ((Index - 1) * 230.f);
	const FVector To = Want - GetActorLocation();
	const float D = FVector2D(To.X, To.Y).Size();

	if (FVector::Dist(P, GetActorLocation()) > 4000.f || FMath::Abs(P.Z - GetActorLocation().Z) > 1500.f)
	{
		SetActorLocation(Want + FVector(0, 0, 40.f), false, nullptr, ETeleportType::TeleportPhysics);
		GetCharacterMovement()->StopMovementImmediately();
		return;
	}
	ASREnemy* E = Target.Get();
	if (!E || E->IsDead()) Target = E = PickTarget(Player);
	if (E)
	{
		const FVector TE = E->GetActorLocation() - GetActorLocation();
		const float DE = FVector2D(TE.X, TE.Y).Size();
		const float Range = Index == 0 ? 180.f + E->GetRadius() : 1100.f;
		GetCharacterMovement()->MaxWalkSpeed = 620.f;
		if (DE > Range) AddMovementInput(FVector(TE.X, TE.Y, 0.f).GetSafeNormal(), 1.f);
		else if (AttackCool <= 0.f) AttackTarget(E, Player);
		return;
	}
	GetCharacterMovement()->MaxWalkSpeed = D > 900.f ? 900.f : 560.f;
	if (D > 160.f) AddMovementInput(FVector(To.X, To.Y, 0.f).GetSafeNormal(), FMath::Clamp(D / 400.f, 0.3f, 1.f));
}

void ASRCompanion::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Clock += DeltaSeconds;
	TalkCool = FMath::Max(0.f, TalkCool - DeltaSeconds);
	AttackCool = FMath::Max(0.f, AttackCool - DeltaSeconds);
	AttackAnim = FMath::Max(0.f, AttackAnim - DeltaSeconds);

	ASlimeCharacter* Player = Cast<ASlimeCharacter>(UGameplayStatics::GetPlayerPawn(this, 0));
	if (bRecruited && Player && !Player->bDead)
	{
		Follow(Player, DeltaSeconds);
	}
	else if (Player)
	{
		// Waiting at home: face the player when they come close
		const FVector To = Player->GetActorLocation() - GetActorLocation();
		if (To.Size() < 600.f) SetActorRotation(FMath::RInterpTo(GetActorRotation(), FRotator(0, To.Rotation().Yaw, 0), DeltaSeconds, 4.f));
	}

	const float Speed = GetVelocity().Size2D();
	const float Amount = FMath::Clamp(Speed / 500.f, 0.f, 1.f);
	WalkPhase += DeltaSeconds * (2.f + Speed * 0.012f);
	Rig.Walk(WalkPhase, Amount, Clock);
	if (AttackAnim > 0.f && Rig.ArmR)
	{
		const float T = 1.f - AttackAnim / 0.35f;
		Rig.ArmR->SetRelativeRotation(Index == 0 ? FRotator(FMath::Lerp(150.f, -10.f, T), 0, 0) : FRotator(90.f, 0, 0));
	}
	if (Rig.Tail) Rig.Tail->SetRelativeRotation(FRotator(0, FMath::Sin(Clock * (bRecruited ? 7.f : 3.f)) * 18.f, 0));
}
