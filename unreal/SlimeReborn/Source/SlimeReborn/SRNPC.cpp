#include "SRNPC.h"
#include "SlimeCharacter.h"
#include "SRGameMode.h"
#include "Components/CapsuleComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"

ASRNPC::ASRNPC()
{
	PrimaryActorTick.bCanEverTick = true;
	AutoPossessAI = EAutoPossessAI::PlacedInWorldOrSpawned;
	GetCapsuleComponent()->InitCapsuleSize(34.f, 92.f);
	GetCapsuleComponent()->SetCollisionResponseToChannel(ECC_Camera, ECR_Ignore);
	UCharacterMovementComponent* Move = GetCharacterMovement();
	Move->MaxWalkSpeed = 140.f;
	Move->bOrientRotationToMovement = true;
	Move->RotationRate = FRotator(0, 240.f, 0);
	Move->bRunPhysicsWithNoController = true;
	bUseControllerRotationYaw = false;
}

void ASRNPC::Setup(const FString& InName, ESRNPCRole InRole, int32 InSeed, float InWanderRadius)
{
	NPCName = InName;
	NPCRole = InRole;
	Seed = InSeed;
	WanderRadius = InWanderRadius;
}

void ASRNPC::BeginPlay()
{
	Super::BeginPlay();
	Home = GetActorLocation();
	Target = Home;
	FRandomStream R(Seed);
	WaitTime = R.FRandRange(0.f, 4.f);
	WalkPhase = R.FRandRange(0.f, 6.f);
	if (NPCRole == ESRNPCRole::Child) GetCharacterMovement()->MaxWalkSpeed = 190.f;
	BuildBody();
}

void ASRNPC::BuildBody()
{
	FRandomStream R(Seed * 7919 + 13);
	static const uint32 Skins[] = { 0xf1d2b6, 0xe0b48e, 0xc68f63, 0x9a6440, 0x6e4529, 0xf6dcc8 };
	static const uint32 Hairs[] = { 0x2a1c12, 0x5a3a1e, 0xb08040, 0xe2c27a, 0x1a1a1e, 0x8a3a1c, 0xd8d8d8, 0x6b4a8a };
	static const uint32 Clothes[] = { 0x7a3a2a, 0x2f4f7a, 0x3a6a3a, 0x8a6a2a, 0x5a2a6a, 0x6a6a6a, 0xa0522d, 0x2a5a5a, 0x9a8a6a };
	FSRHumanStyle S;
	S.Skin = SR::Hex(Skins[R.RandRange(0, static_cast<int32>(UE_ARRAY_COUNT(Skins)) - 1)]);
	S.Hair = SR::Hex(Hairs[R.RandRange(0, static_cast<int32>(UE_ARRAY_COUNT(Hairs)) - 1)]);
	S.Shirt = SR::Hex(Clothes[R.RandRange(0, static_cast<int32>(UE_ARRAY_COUNT(Clothes)) - 1)]);
	S.Pants = SR::Hex(Clothes[R.RandRange(0, static_cast<int32>(UE_ARRAY_COUNT(Clothes)) - 1)]) * 0.6f;
	const bool bFemale = R.FRand() < 0.5f;
	S.bLongHair = bFemale;
	S.bSkirt = bFemale && R.FRand() < 0.7f;
	S.Height = R.FRandRange(0.92f, 1.06f);
	S.bBeard = !bFemale && R.FRand() < 0.3f;

	switch (NPCRole)
	{
	case ESRNPCRole::Child:
		S.Height = 0.62f;
		S.bBeard = false;
		break;
	case ESRNPCRole::GuildMaster:
		S.Height = 1.12f; S.Bulk = 1.35f; S.bBeard = true; S.bLongHair = false; S.bSkirt = false;
		S.Hair = SR::Hex(0x8a3a1c); S.Shirt = SR::Hex(0x5a3a22); S.bCape = true; S.Cape = SR::Hex(0x2a4a7a); S.Weapon = 5;
		break;
	case ESRNPCRole::Merchant:
		S.bLongHair = true; S.bSkirt = true; S.Hair = SR::Hex(0xc8902a); S.Shirt = SR::Hex(0x2a6a5a); S.Accent = SR::Hex(0xe8c040);
		break;
	case ESRNPCRole::Blacksmith:
		S.Bulk = 1.4f; S.bBeard = true; S.bLongHair = false; S.bSkirt = false; S.bBald = true;
		S.Shirt = SR::Hex(0x4a3a2a); S.Skin = SR::Hex(0xc68f63); S.Weapon = 5;
		break;
	case ESRNPCRole::Priestess:
		S.bLongHair = true; S.bSkirt = true; S.Hair = SR::Hex(0xf0e6c8); S.Shirt = SR::Hex(0xf2f0ea); S.Accent = SR::Hex(0xd4a72c);
		S.bCape = true; S.Cape = SR::Hex(0xd4c48a); S.Weapon = 3; S.Eyes = SR::Hex(0x3a6ab0);
		break;
	case ESRNPCRole::Guard:
		S.bHelmet = true; S.bSkirt = false; S.bLongHair = false; S.Shirt = SR::Hex(0x9aa0aa); S.Pants = SR::Hex(0x5a5e66);
		S.Cape = SR::Hex(0x8c1c1c); S.bCape = true; S.Weapon = 2; S.Height = 1.06f;
		break;
	case ESRNPCRole::Bard:
		S.Shirt = SR::Hex(0x8a2a6a); S.bCape = true; S.Cape = SR::Hex(0xe8b030); S.Weapon = 0;
		break;
	default:
		break;
	}
	USceneComponent* Base = SR::AddPivot(this, GetCapsuleComponent(), FVector(0, 0, -92.f));
	Rig = SR::BuildHumanoid(this, Base, S);
	if (NPCRole == ESRNPCRole::Bard)
	{
		SR::AddPart(this, Rig.Torso, TEXT("Sphere"), FVector(18.f, 0, 120.f), FVector(0.3f, 0.12f, 0.36f), SR::Hex(0x9a6a3a));
		SR::AddPart(this, Rig.Torso, TEXT("Cube"), FVector(22.f, 25.f, 150.f), FVector(0.05f, 0.5f, 0.05f), SR::Hex(0x5a3a1a), FRotator(0, 0, 30.f));
	}
}

void ASRNPC::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Clock += DeltaSeconds;

	// Only animate citizens close to the camera.
	APawn* PlayerPawn = UGameplayStatics::GetPlayerPawn(this, 0);
	const float DistSq = PlayerPawn ? FVector::DistSquared(PlayerPawn->GetActorLocation(), GetActorLocation()) : 0.f;
	if (DistSq > FMath::Square(9000.f))
	{
		return;
	}

	if (TalkTime > 0.f && Listener.IsValid())
	{
		TalkTime -= DeltaSeconds;
		const FVector To = Listener->GetActorLocation() - GetActorLocation();
		const FRotator Want(0, To.Rotation().Yaw, 0);
		SetActorRotation(FMath::RInterpTo(GetActorRotation(), Want, DeltaSeconds, 6.f));
		Rig.Walk(0.f, 0.f, Clock);
		if (Rig.ArmR) Rig.ArmR->SetRelativeRotation(FRotator(25.f + FMath::Sin(Clock * 6.f) * 15.f, 0, 10.f));
		if (Rig.Head) Rig.Head->SetRelativeRotation(FRotator(FMath::Sin(Clock * 3.f) * 5.f, 0, 0));
		return;
	}

	if (WanderRadius > 0.f)
	{
		const FVector To = Target - GetActorLocation();
		if (FVector2D(To.X, To.Y).Size() < 80.f)
		{
			WaitTime -= DeltaSeconds;
			if (WaitTime <= 0.f)
			{
				const float A = FMath::FRandRange(0.f, 2.f * PI);
				const float D = FMath::FRandRange(0.f, WanderRadius);
				Target = Home + FVector(FMath::Cos(A) * D, FMath::Sin(A) * D, 0.f);
				WaitTime = FMath::FRandRange(2.f, 7.f);
			}
		}
		else
		{
			AddMovementInput(FVector(To.X, To.Y, 0.f).GetSafeNormal(), 1.f);
		}
	}

	const float Speed = GetVelocity().Size2D();
	const float Amount = FMath::Clamp(Speed / 160.f, 0.f, 1.f);
	WalkPhase += DeltaSeconds * (2.f + Speed * 0.045f);
	Rig.Walk(WalkPhase, Amount, Clock);
	if (NPCRole == ESRNPCRole::Bard && Rig.ArmR)
	{
		Rig.ArmR->SetRelativeRotation(FRotator(40.f + FMath::Sin(Clock * 9.f) * 12.f, 0, 25.f));
	}
}

FString ASRNPC::PromptVerb() const
{
	switch (NPCRole)
	{
	case ESRNPCRole::GuildMaster: return TEXT("Missioni");
	case ESRNPCRole::Merchant: return TEXT("Vendi bottino / Compra pozione (25 oro)");
	case ESRNPCRole::Blacksmith: return TEXT("Potenzia arma");
	case ESRNPCRole::Priestess: return TEXT("Benedizione");
	default: return TEXT("Parla");
	}
}

FString ASRNPC::Interact(ASlimeCharacter* Player)
{
	if (!Player) return FString();
	Listener = Player;
	TalkTime = 4.f;
	ASRGameMode* GM = GetWorld() ? GetWorld()->GetAuthGameMode<ASRGameMode>() : nullptr;
	switch (NPCRole)
	{
	case ESRNPCRole::GuildMaster:
		return GM ? GM->GuildTalk(Player) : FString();

	case ESRNPCRole::Merchant:
		if (Player->Bag.Num() > 0)
		{
			const int32 Count = Player->Bag.Num();
			const int32 Earned = Player->SellBag();
			return FString::Printf(TEXT("Compro tutto il tuo bottino: %d oggetti per %d monete d'oro! Parlami ancora per le pozioni."), Count, Earned);
		}
		if (Player->Gold >= 25)
		{
			Player->Gold -= 25;
			Player->Potions += 1;
			return FString::Printf(TEXT("Una Pozione Curativa, fresca di alambicco! Ne hai %d. Torna quando vuoi!"), Player->Potions);
		}
		return TEXT("Venticinque monete d'oro a pozione, niente sconti... nemmeno per uno slime carino.");

	case ESRNPCRole::Blacksmith:
	{
		const int32 Cost = 90 * (Player->WeaponLevel + 1);
		if (Player->WeaponLevel >= 10) return TEXT("Quest'arma e' gia' una leggenda. Non posso migliorarla oltre.");
		if (Player->Gold >= Cost)
		{
			Player->Gold -= Cost;
			Player->WeaponLevel += 1;
			Player->Recalc();
			return FString::Printf(TEXT("*CLANG* *CLANG* Ecco fatto: arma +%d! Attacco ora %d."), Player->WeaponLevel, FMath::RoundToInt(Player->GetAttack()));
		}
		return FString::Printf(TEXT("Per il prossimo potenziamento (+%d) mi servono %d monete d'oro."), Player->WeaponLevel + 1, Cost);
	}

	case ESRNPCRole::Priestess:
		Player->HP = Player->MaxHP;
		Player->MP = Player->MaxMP;
		{
			static const TCHAR* Lines[] = {
				TEXT("La luce della Dea ti avvolge. Ferite e stanchezza svaniscono."),
				TEXT("Le Grazie dorate sono frammenti dell'Ordine. Toccale per riposare e viaggiare."),
				TEXT("Si dice che il Re degli Orchi sia posseduto da una fame senza fondo... come il tuo potere, Predatore."),
				TEXT("Esistono mondi oltre il nostro. Alcuni rinascono qui con ricordi di un'altra vita. Tu sei uno di loro, vero?"),
			};
			return Lines[(LineIndex++) % UE_ARRAY_COUNT(Lines)];
		}

	case ESRNPCRole::Guard:
	{
		static const TCHAR* Lines[] = {
			TEXT("Le porte sono a sud, est e ovest. A nord c'e' il castello: niente avventurieri senza invito."),
			TEXT("Goblin a sud-ovest, lupi nella foresta a ovest. Gli orchi stanno sulle colline a est."),
			TEXT("Le rovine del nord sono infestate da cavalieri caduti. Non andarci prima del livello 12."),
			TEXT("Dicono che uno slime abbia mangiato un drago intero. Spero non sia vero... vero?"),
		};
		return Lines[(LineIndex++) % UE_ARRAY_COUNT(Lines)];
	}

	case ESRNPCRole::Bard:
	{
		static const TCHAR* Lines[] = {
			TEXT("~ Era solo un impiegato, poi una lama, poi il buio... e rinacque slime nella grotta del drago ~"),
			TEXT("~ Divora il fuoco, divora il vento, il Predatore non ha mai fame abbastanza ~"),
			TEXT("~ Mille mondi in uno solo: cavalieri, magi, slime e re. Questa e' la Terra Spezzata ~"),
		};
		return Lines[(LineIndex++) % UE_ARRAY_COUNT(Lines)];
	}

	default:
		return CitizenLine(Player);
	}
}

FString ASRNPC::CitizenLine(ASlimeCharacter* Player)
{
	static const TCHAR* Adult[] = {
		TEXT("Benvenuto ad Altheria, la citta' piu' grande del regno!"),
		TEXT("La Gilda degli Avventurieri e' a sud-ovest della fontana. Brann paga bene."),
		TEXT("Elia vende pozioni al mercato. Io ne compro sempre tre prima di uscire dalle mura."),
		TEXT("Torvin il fabbro puo' potenziare qualsiasi arma... se hai abbastanza oro."),
		TEXT("Di notte le lanterne si accendono e la citta' diventa bellissima."),
		TEXT("Hai visto le Grazie dorate? Si dice che chi le tocca possa viaggiare istantaneamente."),
		TEXT("Mio cugino e' stato morso da un Lupo Tempesta. Ora ulula alla luna."),
		TEXT("La cattedrale e' a nord-est. La sacerdotessa Lyra guarisce chiunque gratis."),
		TEXT("Un mago della torre dice che il mondo e' stato fuso con altri mondi. Che sciocchezze..."),
		TEXT("Gli uomini lucertola della palude sputano fuoco. Porta acqua. Tanta acqua."),
	};
	static const TCHAR* Kid[] = {
		TEXT("Wow! Sei uno slime vero? Posso toccarti? E' morbido?"),
		TEXT("Da grande voglio diventare un avventuriero di rango S!"),
		TEXT("Mia mamma dice di non uscire dalle mura. Ma io ho visto un goblin una volta!"),
	};
	if (NPCRole == ESRNPCRole::Child) return Kid[(Seed + LineIndex++) % UE_ARRAY_COUNT(Kid)];
	if (Player && Player->Level >= 10 && (LineIndex % 4) == 3)
	{
		++LineIndex;
		return FString::Printf(TEXT("Tu sei l'eroe di livello %d di cui parlano tutti! Che onore!"), Player->Level);
	}
	return Adult[(Seed + LineIndex++) % UE_ARRAY_COUNT(Adult)];
}
