using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TourValve.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddMarkupSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MarkupSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TicketMarkupEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    TicketBaseFarePercent = table.Column<decimal>(type: "numeric(5,4)", nullable: false),
                    TicketDefaultAmount = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                    TicketEconomyAmount = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                    TicketBusinessAmount = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                    TicketFirstAmount = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                    AncillaryMarkupEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    AncillaryDefaultPercent = table.Column<decimal>(type: "numeric(5,4)", nullable: false),
                    AncillaryBaggagePercent = table.Column<decimal>(type: "numeric(5,4)", nullable: false),
                    AncillaryMealPercent = table.Column<decimal>(type: "numeric(5,4)", nullable: false),
                    AncillarySeatPercent = table.Column<decimal>(type: "numeric(5,4)", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedByEmail = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MarkupSettings", x => x.Id);
                });

            migrationBuilder.InsertData(
                table: "MarkupSettings",
                columns: new[]
                {
                    "Id",
                    "TicketMarkupEnabled",
                    "TicketBaseFarePercent",
                    "TicketDefaultAmount",
                    "TicketEconomyAmount",
                    "TicketBusinessAmount",
                    "TicketFirstAmount",
                    "AncillaryMarkupEnabled",
                    "AncillaryDefaultPercent",
                    "AncillaryBaggagePercent",
                    "AncillaryMealPercent",
                    "AncillarySeatPercent",
                    "UpdatedAt",
                    "UpdatedByEmail"
                },
                values: new object[]
                {
                    new Guid("22222222-2222-2222-2222-222222222222"),
                    true,
                    0.10m,
                    2m,
                    2m,
                    5m,
                    10m,
                    true,
                    0.07m,
                    0.07m,
                    0.07m,
                    0.07m,
                    new DateTime(2026, 8, 3, 0, 0, 0, DateTimeKind.Utc),
                    "system-migration"
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "MarkupSettings",
                keyColumn: "Id",
                keyValue: new Guid("22222222-2222-2222-2222-222222222222"));

            migrationBuilder.DropTable(
                name: "MarkupSettings");
        }
    }
}
